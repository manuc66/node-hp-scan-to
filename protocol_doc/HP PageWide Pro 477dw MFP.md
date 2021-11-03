<!-- TOC -->

- [Protocol](downgraded)
    - [Recorded Sequence](#recorded-sequence)
        - [`GET /eSCL/ScannerCapabilities`](#get-escl-scanner-capabilities)
        - [`GET /eSCL/ScannerStatus`](#get-escl-scanner-status)
        - [`POST /eSCL/ScanJobs`](#post-escl-scan-jobs)
        - [`GET /eSCL/ScanJobs/1c9a7213-12cb-1f09-a7e3-3822e23ba011/NextDocument`](#get-escl-scan-jobs-nextdocument)

<!-- /TOC -->

# Protocol

Scan to computer for `HP PageWide Pro 477dw MFP` recorder on a MacOS (HP Easy Scan) computer.

## Recorded Sequence

Using Wireshark for HP Easy Scan and HP Web Services

### `GET /eSCL/ScannerCapabilities`

Detecting Scanner Capabilities

_Request_

```http
GET /eSCL/ScannerCapabilities HTTP/1.1
HOST: 192.168.0.20
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP PageWide Pro 477dw MFP - D3Q20B; Serial Number: CN136MX02P; Built: Wed Oct 13, 2021 07:50:14PM {MAVEDWPP1N001.2142A.00}
Content-Type: text/xml
Transfer-Encoding: chunked
Content-Encoding: gzip
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<scan:ScannerCapabilities xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm" xmlns:dest="http://schemas.hp.com/imaging/destination/2011/06/06" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://schemas.hp.com/imaging/escl/2011/05/03 ../../schemas/eSCL.xsd">
	<pwg:Version>2.5</pwg:Version>
	<pwg:MakeAndModel>HP PageWide Pro 477dw MFP</pwg:MakeAndModel>
	<pwg:SerialNumber>CN136MX02P</pwg:SerialNumber>
	<scan:Platen>
		<scan:PlatenInputCaps>
			<scan:MinWidth>8</scan:MinWidth>
			<scan:MaxWidth>2550</scan:MaxWidth>
			<scan:MinHeight>8</scan:MinHeight>
			<scan:MaxHeight>4201</scan:MaxHeight>
			<scan:MinPageWidth>8</scan:MinPageWidth>
			<scan:MinPageHeight>8</scan:MinPageHeight>
			<scan:MaxScanRegions>1</scan:MaxScanRegions>
			<scan:SettingProfiles>
				<scan:SettingProfile>
					<scan:ColorModes>
						<scan:ColorMode>Grayscale8</scan:ColorMode>
						<scan:ColorMode>RGB24</scan:ColorMode>
					</scan:ColorModes>
					<scan:ContentTypes>
						<pwg:ContentType>Photo</pwg:ContentType>
						<pwg:ContentType>Text</pwg:ContentType>
						<pwg:ContentType>TextAndPhoto</pwg:ContentType>
					</scan:ContentTypes>
					<scan:DocumentFormats>
						<pwg:DocumentFormat>application/octet-stream</pwg:DocumentFormat>
						<pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat>
						<pwg:DocumentFormat>application/pdf</pwg:DocumentFormat>
						<scan:DocumentFormatExt>application/octet-stream</scan:DocumentFormatExt>
						<scan:DocumentFormatExt>image/jpeg</scan:DocumentFormatExt>
						<scan:DocumentFormatExt>application/pdf</scan:DocumentFormatExt>
					</scan:DocumentFormats>
					<scan:SupportedResolutions>
						<scan:DiscreteResolutions>
							<scan:DiscreteResolution>
								<scan:XResolution>75</scan:XResolution>
								<scan:YResolution>75</scan:YResolution>
							</scan:DiscreteResolution>
							<scan:DiscreteResolution>
								<scan:XResolution>100</scan:XResolution>
								<scan:YResolution>100</scan:YResolution>
							</scan:DiscreteResolution>
							<scan:DiscreteResolution>
								<scan:XResolution>150</scan:XResolution>
								<scan:YResolution>150</scan:YResolution>
							</scan:DiscreteResolution>
							<scan:DiscreteResolution>
								<scan:XResolution>200</scan:XResolution>
								<scan:YResolution>200</scan:YResolution>
							</scan:DiscreteResolution>
							<scan:DiscreteResolution>
								<scan:XResolution>300</scan:XResolution>
								<scan:YResolution>300</scan:YResolution>
							</scan:DiscreteResolution>
							<scan:DiscreteResolution>
								<scan:XResolution>400</scan:XResolution>
								<scan:YResolution>400</scan:YResolution>
							</scan:DiscreteResolution>
							<scan:DiscreteResolution>
								<scan:XResolution>600</scan:XResolution>
								<scan:YResolution>600</scan:YResolution>
							</scan:DiscreteResolution>
							<scan:DiscreteResolution>
								<scan:XResolution>1200</scan:XResolution>
								<scan:YResolution>1200</scan:YResolution>
							</scan:DiscreteResolution>
						</scan:DiscreteResolutions>
					</scan:SupportedResolutions>
					<scan:ColorSpaces>
						<scan:ColorSpace>YCC</scan:ColorSpace>
						<scan:ColorSpace>RGB</scan:ColorSpace>
						<scan:ColorSpace>sRGB</scan:ColorSpace>
					</scan:ColorSpaces>
				</scan:SettingProfile>
			</scan:SettingProfiles>
			<scan:SupportedIntents>
				<scan:Intent>Document</scan:Intent>
				<scan:Intent>Photo</scan:Intent>
				<scan:Intent>Preview</scan:Intent>
				<scan:Intent>TextAndGraphic</scan:Intent>
			</scan:SupportedIntents>
			<scan:MaxOpticalXResolution>1200</scan:MaxOpticalXResolution>
			<scan:MaxOpticalYResolution>1200</scan:MaxOpticalYResolution>
			<scan:RiskyLeftMargin>40</scan:RiskyLeftMargin>
			<scan:RiskyRightMargin>30</scan:RiskyRightMargin>
			<scan:RiskyTopMargin>32</scan:RiskyTopMargin>
			<scan:RiskyBottomMargin>45</scan:RiskyBottomMargin>
		</scan:PlatenInputCaps>
	</scan:Platen>
	<scan:Adf>
		<scan:AdfSimplexInputCaps>
			<scan:MinWidth>8</scan:MinWidth>
			<scan:MaxWidth>2550</scan:MaxWidth>
			<scan:MinHeight>8</scan:MinHeight>
			<scan:MaxHeight>4200</scan:MaxHeight>
			<scan:MinPageWidth>1200</scan:MinPageWidth>
			<scan:MinPageHeight>1800</scan:MinPageHeight>
			<scan:MaxScanRegions>1</scan:MaxScanRegions>
			<scan:SettingProfiles>
				<scan:SettingProfile>
					<scan:ColorModes>
						<scan:ColorMode>Grayscale8</scan:ColorMode>
						<scan:ColorMode>RGB24</scan:ColorMode>
					</scan:ColorModes>
					<scan:ContentTypes>
						<pwg:ContentType>Photo</pwg:ContentType>
						<pwg:ContentType>Text</pwg:ContentType>
						<pwg:ContentType>TextAndPhoto</pwg:ContentType>
					</scan:ContentTypes>
					<scan:DocumentFormats>
						<pwg:DocumentFormat>application/octet-stream</pwg:DocumentFormat>
						<pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat>
						<pwg:DocumentFormat>application/pdf</pwg:DocumentFormat>
						<scan:DocumentFormatExt>application/octet-stream</scan:DocumentFormatExt>
						<scan:DocumentFormatExt>image/jpeg</scan:DocumentFormatExt>
						<scan:DocumentFormatExt>application/pdf</scan:DocumentFormatExt>
					</scan:DocumentFormats>
					<scan:SupportedResolutions>
						<scan:DiscreteResolutions>
							<scan:DiscreteResolution>
								<scan:XResolution>75</scan:XResolution>
								<scan:YResolution>75</scan:YResolution>
							</scan:DiscreteResolution>
							<scan:DiscreteResolution>
								<scan:XResolution>100</scan:XResolution>
								<scan:YResolution>100</scan:YResolution>
							</scan:DiscreteResolution>
							<scan:DiscreteResolution>
								<scan:XResolution>150</scan:XResolution>
								<scan:YResolution>150</scan:YResolution>
							</scan:DiscreteResolution>
							<scan:DiscreteResolution>
								<scan:XResolution>200</scan:XResolution>
								<scan:YResolution>200</scan:YResolution>
							</scan:DiscreteResolution>
							<scan:DiscreteResolution>
								<scan:XResolution>300</scan:XResolution>
								<scan:YResolution>300</scan:YResolution>
							</scan:DiscreteResolution>
						</scan:DiscreteResolutions>
					</scan:SupportedResolutions>
					<scan:ColorSpaces>
						<scan:ColorSpace>YCC</scan:ColorSpace>
						<scan:ColorSpace>RGB</scan:ColorSpace>
						<scan:ColorSpace>sRGB</scan:ColorSpace>
					</scan:ColorSpaces>
				</scan:SettingProfile>
			</scan:SettingProfiles>
			<scan:SupportedIntents>
				<scan:Intent>Document</scan:Intent>
				<scan:Intent>Photo</scan:Intent>
				<scan:Intent>Preview</scan:Intent>
				<scan:Intent>TextAndGraphic</scan:Intent>
			</scan:SupportedIntents>
			<scan:EdgeAutoDetection>
				<scan:SupportedEdge>BottomEdge</scan:SupportedEdge>
			</scan:EdgeAutoDetection>
			<scan:MaxOpticalXResolution>300</scan:MaxOpticalXResolution>
			<scan:MaxOpticalYResolution>300</scan:MaxOpticalYResolution>
			<scan:RiskyLeftMargin>16</scan:RiskyLeftMargin>
			<scan:RiskyRightMargin>0</scan:RiskyRightMargin>
			<scan:RiskyTopMargin>35</scan:RiskyTopMargin>
			<scan:RiskyBottomMargin>35</scan:RiskyBottomMargin>
		</scan:AdfSimplexInputCaps>
		<scan:AdfDuplexInputCaps>
			<scan:MinWidth>8</scan:MinWidth>
			<scan:MaxWidth>2550</scan:MaxWidth>
			<scan:MinHeight>8</scan:MinHeight>
			<scan:MaxHeight>4200</scan:MaxHeight>
			<scan:MinPageWidth>1200</scan:MinPageWidth>
			<scan:MinPageHeight>1800</scan:MinPageHeight>
			<scan:MaxScanRegions>1</scan:MaxScanRegions>
			<scan:SettingProfiles>
				<scan:SettingProfile>
					<scan:ColorModes>
						<scan:ColorMode>Grayscale8</scan:ColorMode>
						<scan:ColorMode>RGB24</scan:ColorMode>
					</scan:ColorModes>
					<scan:ContentTypes>
						<pwg:ContentType>Photo</pwg:ContentType>
						<pwg:ContentType>Text</pwg:ContentType>
						<pwg:ContentType>TextAndPhoto</pwg:ContentType>
					</scan:ContentTypes>
					<scan:DocumentFormats>
						<pwg:DocumentFormat>application/octet-stream</pwg:DocumentFormat>
						<pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat>
						<pwg:DocumentFormat>application/pdf</pwg:DocumentFormat>
						<scan:DocumentFormatExt>application/octet-stream</scan:DocumentFormatExt>
						<scan:DocumentFormatExt>image/jpeg</scan:DocumentFormatExt>
						<scan:DocumentFormatExt>application/pdf</scan:DocumentFormatExt>
					</scan:DocumentFormats>
					<scan:SupportedResolutions>
						<scan:DiscreteResolutions>
							<scan:DiscreteResolution>
								<scan:XResolution>75</scan:XResolution>
								<scan:YResolution>75</scan:YResolution>
							</scan:DiscreteResolution>
							<scan:DiscreteResolution>
								<scan:XResolution>100</scan:XResolution>
								<scan:YResolution>100</scan:YResolution>
							</scan:DiscreteResolution>
							<scan:DiscreteResolution>
								<scan:XResolution>150</scan:XResolution>
								<scan:YResolution>150</scan:YResolution>
							</scan:DiscreteResolution>
							<scan:DiscreteResolution>
								<scan:XResolution>200</scan:XResolution>
								<scan:YResolution>200</scan:YResolution>
							</scan:DiscreteResolution>
							<scan:DiscreteResolution>
								<scan:XResolution>300</scan:XResolution>
								<scan:YResolution>300</scan:YResolution>
							</scan:DiscreteResolution>
						</scan:DiscreteResolutions>
					</scan:SupportedResolutions>
					<scan:ColorSpaces>
						<scan:ColorSpace>YCC</scan:ColorSpace>
						<scan:ColorSpace>RGB</scan:ColorSpace>
						<scan:ColorSpace>sRGB</scan:ColorSpace>
					</scan:ColorSpaces>
				</scan:SettingProfile>
			</scan:SettingProfiles>
			<scan:SupportedIntents>
				<scan:Intent>Document</scan:Intent>
				<scan:Intent>Photo</scan:Intent>
				<scan:Intent>Preview</scan:Intent>
				<scan:Intent>TextAndGraphic</scan:Intent>
			</scan:SupportedIntents>
			<scan:EdgeAutoDetection>
				<scan:SupportedEdge>BottomEdge</scan:SupportedEdge>
			</scan:EdgeAutoDetection>
			<scan:MaxOpticalXResolution>300</scan:MaxOpticalXResolution>
			<scan:MaxOpticalYResolution>300</scan:MaxOpticalYResolution>
			<scan:RiskyLeftMargin>16</scan:RiskyLeftMargin>
			<scan:RiskyRightMargin>0</scan:RiskyRightMargin>
			<scan:RiskyTopMargin>35</scan:RiskyTopMargin>
			<scan:RiskyBottomMargin>35</scan:RiskyBottomMargin>
		</scan:AdfDuplexInputCaps>
		<scan:FeederCapacity>50</scan:FeederCapacity>
		<scan:AdfOptions>
			<scan:AdfOption>DetectPaperLoaded</scan:AdfOption>
			<scan:AdfOption>Duplex</scan:AdfOption>
		</scan:AdfOptions>
	</scan:Adf>
	<scan:BrightnessSupport>
		<scan:Min>0</scan:Min>
		<scan:Max>2000</scan:Max>
		<scan:Normal>1000</scan:Normal>
		<scan:Step>1</scan:Step>
	</scan:BrightnessSupport>
	<scan:ContrastSupport>
		<scan:Min>0</scan:Min>
		<scan:Max>2000</scan:Max>
		<scan:Normal>1000</scan:Normal>
		<scan:Step>1</scan:Step>
	</scan:ContrastSupport>
	<scan:ThresholdSupport>
		<scan:Min>0</scan:Min>
		<scan:Max>255</scan:Max>
		<scan:Normal>128</scan:Normal>
		<scan:Step>1</scan:Step>
	</scan:ThresholdSupport>
	<scan:eSCLConfigCap>
		<scan:StateSupport>
			<scan:State>disabled</scan:State>
			<scan:State>enabled</scan:State>
		</scan:StateSupport>
	</scan:eSCLConfigCap>
	<scan:JobSourceInfoSupport>true</scan:JobSourceInfoSupport>
</scan:ScannerCapabilities>
```

### `GET /eSCL/ScannerStatus`

Getting information about scanner status

_Request_

```http
GET /eSCL/ScannerStatus HTTP/1.1
HOST: 192.168.0.20
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP PageWide Pro 477dw MFP - D3Q20B; Serial Number: CN136MX02P; Built: Wed Oct 13, 2021 07:50:14PM {MAVEDWPP1N001.2142A.00}
Content-Type: text/xml
Transfer-Encoding: chunked
Content-Encoding: gzip
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<scan:ScannerStatus xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://schemas.hp.com/imaging/escl/2011/05/03 ../../schemas/eSCL.xsd">
	<pwg:Version>2.5</pwg:Version>
	<pwg:State>Idle</pwg:State>
	<scan:AdfState>ScannerAdfLoaded</scan:AdfState>
	<scan:Jobs>
		<scan:JobInfo>
			<pwg:JobUri>/eSCL/ScanJobs/1c986213-09ff-1f09-a0d9-3822e23ba011</pwg:JobUri>
			<pwg:JobUuid>1c986213-09ff-1f09-a0d9-3822e23ba011</pwg:JobUuid>
			<scan:Age>93921</scan:Age>
			<pwg:ImagesCompleted>9</pwg:ImagesCompleted>
			<pwg:ImagesToTransfer>0</pwg:ImagesToTransfer>
			<pwg:JobState>Completed</pwg:JobState>
			<pwg:JobStateReasons>
				<pwg:JobStateReason>JobCompletedSuccessfully</pwg:JobStateReason>
			</pwg:JobStateReasons>
		</scan:JobInfo>
		<scan:JobInfo>
			<pwg:JobUri>/eSCL/ScanJobs/1c9849e3-0997-1f09-b3ba-3822e23ba011</pwg:JobUri>
			<pwg:JobUuid>1c9849e3-0997-1f09-b3ba-3822e23ba011</pwg:JobUuid>
			<scan:Age>100247</scan:Age>
			<pwg:ImagesCompleted>8</pwg:ImagesCompleted>
			<pwg:ImagesToTransfer>0</pwg:ImagesToTransfer>
			<pwg:JobState>Completed</pwg:JobState>
			<pwg:JobStateReasons>
				<pwg:JobStateReason>JobCompletedSuccessfully</pwg:JobStateReason>
			</pwg:JobStateReasons>
		</scan:JobInfo>
	</scan:Jobs>
</scan:ScannerStatus>

```

### `POST /eSCL/ScanJobs`

Creating Scan Jobs

_Request_

```http
POST /eSCL/ScanJobs HTTP/1.1
HOST: 192.168.1.7:8080
Content-Type: text/xml

<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03"
                   xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/"
                   xmlns:dd3="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06"
                   xmlns:fw="http://www.hp.com/schemas/imaging/con/firewall/2011/01/05"
                   xmlns:scc="http://schemas.hp.com/imaging/escl/2011/05/03"
                   xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
    <pwg:Version>2.1</pwg:Version>
    <scan:Intent>Document</scan:Intent>
    <pwg:ScanRegions>
        <pwg:ScanRegion>
            <pwg:Height>3507</pwg:Height>
            <pwg:Width>2481</pwg:Width>
            <pwg:XOffset>0</pwg:XOffset>
            <pwg:YOffset>0</pwg:YOffset>
        </pwg:ScanRegion>
    </pwg:ScanRegions>
    <pwg:InputSource>Feeder</pwg:InputSource>
    <scan:DocumentFormatExt>application/pdf</scan:DocumentFormatExt>
    <scan:XResolution>300</scan:XResolution>
    <scan:YResolution>300</scan:YResolution>
    <scan:ColorMode>RGB24</scan:ColorMode>
    <scan:Duplex>false</scan:Duplex>
    <scan:CompressionFactor>25</scan:CompressionFactor>
    <scan:Brightness>1000</scan:Brightness>
    <scan:Contrast>1000</scan:Contrast>
</scan:ScanSettings>
```

_Response_

```http
HTTP/1.1 201 Created
Server: HP HTTP Server; HP PageWide Pro 477dw MFP - D3Q20B; Serial Number: CN136MX02P; Built: Wed Oct 13, 2021 07:50:14PM {MAVEDWPP1N001.2142A.00}
Location: http://192.168.0.20/eSCL/ScanJobs/1c9a7213-12cb-1f09-a7e3-3822e23ba011
Content-Length: 0
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
```

### `GET /eSCL/ScanJobs/1c9a7213-12cb-1f09-a7e3-3822e23ba011/NextDocument`

Fetch (stream) of all documents (single pdf)

_Request_

```http
GET /eSCL/ScanJobs/1c9a7213-12cb-1f09-a7e3-3822e23ba011/NextDocument HTTP/1.1
HOST: 192.168.0.20
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP PageWide Pro 477dw MFP - D3Q20B; Serial Number: CN136MX02P; Built: Wed Oct 13, 2021 07:50:14PM {MAVEDWPP1N001.2142A.00}
Content-Type: application/pdf
Cache-Control: max-age=180
Transfer-Encoding: chunked

...
```