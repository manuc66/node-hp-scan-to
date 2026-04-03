export interface IScanCaps {
  readonly isEscl: boolean;
  get platenMaxWidth(): number | null;
  get platenMaxHeight(): number | null;
  get adfMaxHeight(): number | null;
  get adfMaxWidth(): number | null;
  get adfDuplexMaxWidth(): number | null;
  get adfDuplexMaxHeight(): number | null;
  get hasAdfDuplex(): boolean;
  get hasAdfDetectPaperLoaded(): boolean;
}