/** How the browser's copy and the file are brought together when the app loads. */
export type LoadPlan =
  /** The file can't be reached, so work from the browser and try again later. */
  | "browser-only"
  /** Nothing saved anywhere. */
  | "fresh"
  /** The browser holds work the file doesn't have yet. */
  | "push-local"
  | "use-file"
  /** Two different histories. The file wins, and the browser's is kept as a backup. */
  | "use-file-keep-copy";

export interface LoadFacts {
  available: boolean;
  fileExists: boolean;
  /** The browser has real data, not just unfinished setup. */
  localHasData: boolean;
  identical: boolean;
  /** The file revision this browser last saw. Undefined if it has never synced. */
  localRevision: number | undefined;
  fileRevision: number | undefined;
  /** A save to the file didn't finish. */
  pending: boolean;
  /** The file was damaged and came back from an older backup. */
  fileRecovered?: boolean;
}

export const planLoad = (f: LoadFacts): LoadPlan => {
  if (!f.available) return "browser-only";
  if (!f.fileExists) return f.localHasData ? "push-local" : "fresh";
  if (!f.localHasData || f.identical) return "use-file";
  if (f.fileRecovered) return "push-local";
  if (f.localRevision === f.fileRevision) return f.pending ? "push-local" : "use-file";
  return f.pending || f.localRevision === undefined ? "use-file-keep-copy" : "use-file";
};
