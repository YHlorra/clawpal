import type { DoctorReport } from "./types";

export interface AppState {
  doctor: DoctorReport | null;
  message: string;
}

export const initialState: AppState = {
  doctor: null,
  message: "",
};

export type Action =
  | { type: "setDoctor"; doctor: DoctorReport }
  | { type: "setMessage"; message: string };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "setDoctor":
      return { ...state, doctor: action.doctor };
    case "setMessage":
      return { ...state, message: action.message };
    default:
      return state;
  }
}
