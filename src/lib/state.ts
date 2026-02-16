import type { Recipe, PreviewResult, HistoryItem, SystemStatus, DoctorReport } from "./types";

export interface AppState {
  recipes: Recipe[];
  history: HistoryItem[];
  status: SystemStatus | null;
  doctor: DoctorReport | null;
  lastPreview: PreviewResult | null;
  message: string;
}

export const initialState: AppState = {
  recipes: [],
  history: [],
  status: null,
  doctor: null,
  lastPreview: null,
  message: "",
};

export type Action =
  | { type: "setRecipes"; recipes: Recipe[] }
  | { type: "setHistory"; history: HistoryItem[] }
  | { type: "setStatus"; status: SystemStatus }
  | { type: "setDoctor"; doctor: DoctorReport }
  | { type: "setPreview"; preview: PreviewResult }
  | { type: "setMessage"; message: string };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "setRecipes":
      return { ...state, recipes: action.recipes };
    case "setHistory":
      return { ...state, history: action.history };
    case "setStatus":
      return { ...state, status: action.status };
    case "setDoctor":
      return { ...state, doctor: action.doctor };
    case "setPreview":
      return { ...state, lastPreview: action.preview };
    case "setMessage":
      return { ...state, message: action.message };
    default:
      return state;
  }
}
