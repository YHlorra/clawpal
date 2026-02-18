use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use russh::client;
use russh::keys::key;
use russh::{ChannelMsg, Disconnect};
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshHostConfig {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    /// "key" | "ssh_config"
    pub auth_method: String,
    pub key_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
}

// ---------------------------------------------------------------------------
// Client handler (accepts all host keys for now)
// ---------------------------------------------------------------------------

struct SshHandler;

#[async_trait]
impl client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // TODO (Phase 3): verify against known_hosts
        Ok(true)
    }
}

// ---------------------------------------------------------------------------
// Connection wrapper
// ---------------------------------------------------------------------------

/// Holds a live SSH session handle.
struct SshConnection {
    handle: client::Handle<SshHandler>,
}

// ---------------------------------------------------------------------------
// Connection pool
// ---------------------------------------------------------------------------

/// A global pool of SSH connections keyed by instance ID.
pub struct SshConnectionPool {
    connections: Mutex<HashMap<String, SshConnection>>,
}

impl SshConnectionPool {
    pub fn new() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
        }
    }

    // -- connect ----------------------------------------------------------

    /// Establish an SSH connection for the given host config and store it in
    /// the pool under `config.id`.
    pub async fn connect(&self, config: &SshHostConfig) -> Result<(), String> {
        let ssh_config = Arc::new(client::Config {
            inactivity_timeout: Some(std::time::Duration::from_secs(300)),
            keepalive_interval: Some(std::time::Duration::from_secs(30)),
            keepalive_max: 5,
            ..<_>::default()
        });

        let addr = (config.host.as_str(), config.port);
        let handler = SshHandler;

        let mut session = client::connect(ssh_config, addr, handler)
            .await
            .map_err(|e| format!("SSH connect failed: {e}"))?;

        // Authenticate
        let authenticated = match config.auth_method.as_str() {
            "key" => {
                let key_path = config
                    .key_path
                    .as_deref()
                    .unwrap_or("~/.ssh/id_rsa");
                let expanded = shellexpand::tilde(key_path).to_string();
                let key_pair = russh::keys::load_secret_key(&expanded, None)
                    .map_err(|e| format!("Failed to load SSH key {expanded}: {e}"))?;
                session
                    .authenticate_publickey(&config.username, Arc::new(key_pair))
                    .await
                    .map_err(|e| format!("Public key auth failed: {e}"))?
            }
            "ssh_config" => {
                // Use ssh-agent for authentication
                self.authenticate_with_agent(&mut session, &config.username).await?
            }
            other => return Err(format!("Unknown auth_method: {other}")),
        };

        if !authenticated {
            return Err("SSH authentication failed (rejected by server)".into());
        }

        let mut pool = self.connections.lock().await;
        pool.insert(
            config.id.clone(),
            SshConnection { handle: session },
        );
        Ok(())
    }

    /// Try all keys offered by the ssh-agent until one succeeds.
    async fn authenticate_with_agent(
        &self,
        session: &mut client::Handle<SshHandler>,
        username: &str,
    ) -> Result<bool, String> {
        let mut agent = russh::keys::agent::client::AgentClient::connect_env()
            .await
            .map_err(|e| format!("Could not connect to SSH agent: {e}"))?;

        let identities = agent
            .request_identities()
            .await
            .map_err(|e| format!("Failed to list agent identities: {e}"))?;

        if identities.is_empty() {
            return Err("SSH agent has no identities loaded".into());
        }

        for identity in &identities {
            let (returned_agent, auth_result) = session
                .authenticate_future(username, identity.clone(), agent)
                .await;
            agent = returned_agent;
            match auth_result {
                Ok(true) => return Ok(true),
                Ok(false) => continue,
                Err(e) => {
                    // Log but try next key
                    eprintln!("Agent auth attempt failed: {e:?}");
                    continue;
                }
            }
        }

        Ok(false)
    }

    // -- disconnect -------------------------------------------------------

    /// Close and remove the connection for the given instance ID.
    pub async fn disconnect(&self, id: &str) -> Result<(), String> {
        let mut pool = self.connections.lock().await;
        if let Some(conn) = pool.remove(id) {
            conn.handle
                .disconnect(Disconnect::ByApplication, "", "")
                .await
                .map_err(|e| format!("SSH disconnect failed: {e}"))?;
        }
        Ok(())
    }

    // -- is_connected -----------------------------------------------------

    /// Check whether a connection exists (and the underlying handle is not
    /// closed) for the given instance ID.
    pub async fn is_connected(&self, id: &str) -> bool {
        let pool = self.connections.lock().await;
        match pool.get(id) {
            Some(conn) => !conn.handle.is_closed(),
            None => false,
        }
    }

    // -- exec -------------------------------------------------------------

    /// Execute a command over SSH and return stdout, stderr and exit code.
    pub async fn exec(&self, id: &str, command: &str) -> Result<SshExecResult, String> {
        let pool = self.connections.lock().await;
        let conn = pool.get(id).ok_or_else(|| format!("No connection for id: {id}"))?;

        let mut channel = conn
            .handle
            .channel_open_session()
            .await
            .map_err(|e| format!("Failed to open channel: {e}"))?;

        channel
            .exec(true, command)
            .await
            .map_err(|e| format!("Failed to exec command: {e}"))?;

        // Drop the pool lock before blocking on channel messages
        drop(pool);

        let mut stdout_bytes: Vec<u8> = Vec::new();
        let mut stderr_bytes: Vec<u8> = Vec::new();
        let mut exit_code: u32 = 1; // default to failure

        loop {
            let Some(msg) = channel.wait().await else {
                break;
            };
            match msg {
                ChannelMsg::Data { ref data } => {
                    stdout_bytes.extend_from_slice(data);
                }
                ChannelMsg::ExtendedData { ref data, ext } => {
                    if ext == 1 {
                        // stderr
                        stderr_bytes.extend_from_slice(data);
                    }
                }
                ChannelMsg::ExitStatus { exit_status } => {
                    exit_code = exit_status;
                }
                _ => {}
            }
        }

        Ok(SshExecResult {
            stdout: String::from_utf8_lossy(&stdout_bytes).into_owned(),
            stderr: String::from_utf8_lossy(&stderr_bytes).into_owned(),
            exit_code,
        })
    }

    // -- SFTP helpers (private) -------------------------------------------

    /// Open an SFTP session on the given connection. The caller is responsible
    /// for calling `sftp.close()` when done.
    async fn open_sftp(&self, id: &str) -> Result<SftpSession, String> {
        let pool = self.connections.lock().await;
        let conn = pool.get(id).ok_or_else(|| format!("No connection for id: {id}"))?;

        let channel = conn
            .handle
            .channel_open_session()
            .await
            .map_err(|e| format!("Failed to open SFTP channel: {e}"))?;

        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| format!("Failed to request SFTP subsystem: {e}"))?;

        // Drop pool lock before the potentially long SFTP init handshake
        drop(pool);

        let sftp = SftpSession::new(channel.into_stream())
            .await
            .map_err(|e| format!("Failed to initialize SFTP session: {e}"))?;

        Ok(sftp)
    }

    // -- sftp_read --------------------------------------------------------

    /// Read a remote file and return its contents as a String.
    pub async fn sftp_read(&self, id: &str, path: &str) -> Result<String, String> {
        let sftp = self.open_sftp(id).await?;
        let data = sftp
            .read(path)
            .await
            .map_err(|e| format!("SFTP read failed for {path}: {e}"))?;
        let _ = sftp.close().await;
        String::from_utf8(data).map_err(|e| format!("File is not valid UTF-8: {e}"))
    }

    // -- sftp_write -------------------------------------------------------

    /// Write a String to a remote file (creates or truncates).
    pub async fn sftp_write(&self, id: &str, path: &str, content: &str) -> Result<(), String> {
        let sftp = self.open_sftp(id).await?;
        let mut file = sftp
            .create(path)
            .await
            .map_err(|e| format!("SFTP create failed for {path}: {e}"))?;

        use tokio::io::AsyncWriteExt;
        file.write_all(content.as_bytes())
            .await
            .map_err(|e| format!("SFTP write failed for {path}: {e}"))?;
        file.flush()
            .await
            .map_err(|e| format!("SFTP flush failed for {path}: {e}"))?;
        file.shutdown()
            .await
            .map_err(|e| format!("SFTP shutdown failed for {path}: {e}"))?;

        let _ = sftp.close().await;
        Ok(())
    }

    // -- sftp_list --------------------------------------------------------

    /// List the entries in a remote directory.
    pub async fn sftp_list(&self, id: &str, path: &str) -> Result<Vec<SftpEntry>, String> {
        let sftp = self.open_sftp(id).await?;
        let read_dir = sftp
            .read_dir(path)
            .await
            .map_err(|e| format!("SFTP read_dir failed for {path}: {e}"))?;

        let entries: Vec<SftpEntry> = read_dir
            .map(|entry| {
                let metadata = entry.metadata();
                SftpEntry {
                    name: entry.file_name(),
                    is_dir: metadata.is_dir(),
                    size: metadata.size.unwrap_or(0),
                }
            })
            .collect();

        let _ = sftp.close().await;
        Ok(entries)
    }

    // -- sftp_remove ------------------------------------------------------

    /// Delete a remote file.
    pub async fn sftp_remove(&self, id: &str, path: &str) -> Result<(), String> {
        let sftp = self.open_sftp(id).await?;
        sftp.remove_file(path)
            .await
            .map_err(|e| format!("SFTP remove failed for {path}: {e}"))?;
        let _ = sftp.close().await;
        Ok(())
    }
}

impl Default for SshConnectionPool {
    fn default() -> Self {
        Self::new()
    }
}
