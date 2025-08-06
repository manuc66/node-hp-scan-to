import xml2js from "xml2js";
import { InputSource } from "../type/InputSource";
import { parseXmlString } from "./ParseXmlString";
import { IScanJobSettings } from "./IScanJobSettings";
import { ScanMode } from "../type/scanMode";

export default class EsclScanJobSettings implements IScanJobSettings {
  private readonly inputSource: InputSource;
  private readonly contentType: "Document" | "Photo";
  private readonly resolution: number;
  private readonly mode: ScanMode;
  private readonly width: number | null;
  private readonly height: number | null;
  private readonly isDuplex: boolean;

  constructor(
    inputSource: InputSource,
    contentType: "Document" | "Photo",
    resolution: number,
    mode: ScanMode,
    width: number | null,
    height: number | null,
    isDuplex: boolean,
  ) {
    this.inputSource = inputSource;
    this.contentType = contentType;
    this.resolution = resolution;
    this.mode = mode;
    this.width = width;
    this.height = height;
    this.isDuplex = isDuplex;
  }

  async toXML(): Promise<string> {
    const rawJob =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<ScanSettings xmlns="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://schemas.hp.com/imaging/escl/2011/05/03 Scan Schema - 0.26.xsd">\n' +
      '\t<Version xmlns="http://www.pwg.org/schemas/2010/12/sm">2.62</Version>\n' +
      "\t<Intent>Document</Intent>\n" +
      '\t<ScanRegions xmlns="http://www.pwg.org/schemas/2010/12/sm" xmlns:n0="http://www.pwg.org/schemas/2010/12/sm" n0:MustHonor="false">\n' +
      "\t\t<ScanRegion>\n" +
      "\t\t\t<Height>4200</Height>\n" +
      "\t\t\t<Width>2550</Width>\n" +
      "\t\t\t<XOffset>0</XOffset>\n" +
      "\t\t\t<YOffset>0</YOffset>\n" +
      "\t\t\t<ContentRegionUnits>escl:ThreeHundredthsOfInches</ContentRegionUnits>\n" +
      "\t\t</ScanRegion>\n" +
      "\t</ScanRegions>\n" +
      "\t<DocumentFormatExt>image/jpeg</DocumentFormatExt>\n" +
      '\t<InputSource xmlns="http://www.pwg.org/schemas/2010/12/sm">Feeder</InputSource>\n' +
      "\t<XResolution>200</XResolution>\n" +
      "\t<YResolution>200</YResolution>\n" +
      "\t<ColorMode>RGB24</ColorMode>\n" +
      "\t<Duplex>true</Duplex>\n" +
      "\t<MultipickDetection>true</MultipickDetection>\n" +
      "\t<ShowMultipickResolveDialog>true</ShowMultipickResolveDialog>\n" +
      "\t<MultipickExclusionLength>0</MultipickExclusionLength>\n" +
      "\t<AutoCrop>false</AutoCrop>\n" +
      "\t<Brightness>996</Brightness>\n" +
      "\t<CompressionFactor>0</CompressionFactor>\n" +
      "\t<Contrast>996</Contrast>\n" +
      "\t<Gamma>180</Gamma>\n" +
      "\t<Highlight>1396</Highlight>\n" +
      "\t<Shadow>70</Shadow>\n" +
      "\t<Overscan>true</Overscan>\n" +
      "</ScanSettings>";

    const parsed = await parseXmlString<{
      ScanSettings: {
        Version: string;
        Intent: string;
        ScanRegions: {
          ScanRegion: {
            Height: number;
            Width: number;
            XOffset: number;
            YOffset: number;
            ContentRegionUnits: string;
          }[];
        }[];
        DocumentFormatExt: string;
        InputSource: {
          _: string; // Text content
          $: { xmlns: string }; // Namespace
        };
        XResolution: number;
        YResolution: number;
        ColorMode: string;
        Duplex: boolean;
        MultipickDetection: boolean;
        ShowMultipickResolveDialog: boolean;
        MultipickExclusionLength: number;
        AutoCrop: boolean;
        Brightness: number;
        CompressionFactor: number;
        Contrast: number;
        Gamma: number;
        Highlight: number;
        Shadow: number;
        Overscan: boolean;
      };
    }>(rawJob);

    parsed.ScanSettings.XResolution = this.resolution;
    parsed.ScanSettings.YResolution = this.resolution;
    parsed.ScanSettings.Intent = this.contentType;

    if (this.mode === ScanMode.Gray) {
      parsed.ScanSettings.ColorMode = "Grayscale8";
    } else {
      parsed.ScanSettings.ColorMode = "RGB24";
    }

    if (this.width !== null) {
      parsed.ScanSettings.ScanRegions[0].ScanRegion[0].Width = this.width;
    }

    if (this.height !== null) {
      parsed.ScanSettings.ScanRegions[0].ScanRegion[0].Height = this.height;
    }

    if (this.inputSource === InputSource.Adf) {
      parsed.ScanSettings.InputSource = {
        _: "Feeder", // The text content
        $: { xmlns: "http://www.pwg.org/schemas/2010/12/sm" }, // The namespace
      };
    } else {
      parsed.ScanSettings.InputSource = {
        _: "Platen", // The text content
        $: { xmlns: "http://www.pwg.org/schemas/2010/12/sm" }, // The namespace
      };
    }

    parsed.ScanSettings.Duplex = this.isDuplex;

    const builder = new xml2js.Builder({
      xmldec: { version: "1.0", encoding: "UTF-8" },
      renderOpts: { pretty: true, indent: "\t", newline: "\n" },
    });

    return builder.buildObject(parsed);
  }

  get xResolution(): number {
    return this.resolution;
  }

  get yResolution(): number {
    return this.resolution;
  }
}
