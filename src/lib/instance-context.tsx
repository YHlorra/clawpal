import { createContext, useContext } from "react";

interface InstanceContextValue {
  instanceId: string;
  isRemote: boolean;
}

export const InstanceContext = createContext<InstanceContextValue>({
  instanceId: "local",
  isRemote: false,
});

export function useInstance() {
  return useContext(InstanceContext);
}
