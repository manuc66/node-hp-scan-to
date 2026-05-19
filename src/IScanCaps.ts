export interface IScanCaps {
  readonly isEscl: boolean;
  readonly platenMaxWidth: number | null;
  readonly platenMaxHeight: number | null;
  readonly adfMaxHeight: number | null;
  readonly adfMaxWidth: number | null;
  readonly adfDuplexMaxWidth: number | null;
  readonly adfDuplexMaxHeight: number | null;
  readonly hasAdfDuplex: boolean;
  readonly hasAdfDetectPaperLoaded: boolean;
  readonly brightnessSupport: { min: number; max: number; defaultValue: number } | null;
  readonly contrastSupport: { min: number; max: number; defaultValue: number } | null;
  readonly gammaSupport: { min: number; max: number; defaultValue: number } | null;
  readonly highlightSupport: { min: number; max: number; defaultValue: number } | null;
  readonly shadowSupport: { min: number; max: number; defaultValue: number } | null;
}
