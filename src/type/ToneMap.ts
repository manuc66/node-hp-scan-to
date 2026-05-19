export interface ToneMapSettings {
  gamma: number;
  brightness: number;
  contrast: number;
  highlite: number;
  shadow: number;
}

export type ToneMapConfig = Partial<ToneMapSettings>;

export const defaultToneMapSettings: ToneMapSettings = {
  gamma: 1000,
  brightness: 1000,
  contrast: 1000,
  highlite: 179,
  shadow: 25,
};

export const defaultEsclToneMapSettings: ToneMapSettings = {
  gamma: 180,
  brightness: 996,
  contrast: 996,
  highlite: 1396,
  shadow: 70,
};