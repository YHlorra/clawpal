export function DiffViewer({ value }: { value: string }) {
  return (
    <pre className="diff-viewer">
      {value}
    </pre>
  );
}
