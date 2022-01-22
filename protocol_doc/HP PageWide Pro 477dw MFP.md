<!-- TOC -->
- [Protocol](downgraded)
    - [Recorded Sequence](#recorded-sequence)
        - [`GET /eSCL/eSclManifest.xml`](#get-escl-scanner-capabilities)
        - [`GET /eSCL/ScannerCapabilities`](#get-escl-scanner-capabilities)
        - [`GET /eSCL/ScannerStatus`](#get-escl-scanner-status)
        - [`POST /eSCL/ScanJobs`](#post-escl-scan-jobs)
        - [`GET /eSCL/ScanJobs/1cdb8df1-2898-1f0a-9962-3822e23ba011/NextDocument`](#get-escl-scan-jobs-nextdocument)
        - [`GET /eSCL/ScanJobs/1cdb8df1-2898-1f0a-9962-3822e23ba011/ScanImageInfo`](#get-escl-scan-jobs-scanimageinfo)
    - [Untested](#untested)
      - [`DELETE /eSCL/ScanJobs/893e6fcd-487f-4056-a8c9-a87709b85daf`](#delete-escl-scan-jobs)
      - [`PUT /eSCL/ScanBufferInfo`](#put-escl-scan-buffer-info)
<!-- /TOC -->

# Protocol

- Scan to computer for `HP PageWide Pro 477dw MFP` recorder on a macOS (HP Easy Scan) computer.
- Scan to computer for `HP PageWide Pro 477dw MFP` recorder on a Windows 11 (HP Smart) computer.
- Used [this pdf](https://mopria.org/MopriaeSCLSpecDownload.php)

## Recorded Sequence

Using Wireshark for HP Easy Scan and HP Web Services

### `GET /eSCL/eSclManifest.xml`

_Request_

```http request
GET /eSCL/eSclManifest.xml HTTP/1.1
Accept-Encoding: gzip, deflate
Cache-Control: max-age=0, no-cache
Accept: text/xml
Host: 192.168.0.20
Connection: Keep-Alive
```

_Response_

```http request
HTTP/1.1 200 OK
Server: HP HTTP Server; HP PageWide Pro 477dw MFP - D3Q20B; Serial Number: CN136MX02P; Built: Wed Oct 13, 2021 07:50:14PM {MAVEDWPP1N001.2142A.00}
Content-Type: text/xml
Content-Encoding: gzip
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache

<?xml version="1.0" encoding="UTF-8"?>
<man:Manifest xmlns:man="http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24" xmlns:map="http://www.hp.com/schemas/imaging/con/ledm/resourcemap/2009/01/27" xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
	xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24 ../../schemas/Manifest.xsd
	http://www.hp.com/schemas/imaging/con/ledm/resourcemap/2009/01/27 ../../schemas/ResourceMap.xsd
	http://www.hp.com/schemas/imaging/con/dictionaries/1.0/ ../../schemas/dd/DataDictionaryMasterLEDM.xsd
	http://www.hp.com/schemas/imaging/con/dictionaries/2008/10/10  ../../schemas/dd2/DataDictionaryMasterLEDM.xsd
	http://schemas.hp.com/imaging/escl/2011/05/03 ../../schemas/eSCL.xsd">
    <dd:Version>
		<dd:Revision>SVN-IPG-LEDM.350</dd:Revision>
		<dd:Date>2011-10-26</dd:Date>
    </dd:Version>

	<man:InterfaceNamespaces>
		<man:InterfaceNamespace>
			http://schemas.hp.com/imaging/escl/2011/05/03
		</man:InterfaceNamespace>
		<man:SpecificationVersion>2.5</man:SpecificationVersion>
	</man:InterfaceNamespaces>
<map:ResourceMap>
		<!-- declare the root URL for this interface -->
		<map:ResourceLink>
			<dd:ResourceURI>/eSCL</dd:ResourceURI>
			<map:Base>Root</map:Base>
		</map:ResourceLink>
		<map:ResourceNode>
			<map:ResourceLink>
				<dd:ResourceURI>/ScannerCapabilities</dd:ResourceURI>
			</map:ResourceLink>
			<map:ResourceType>
				<scan:ScanResourceType>ScannerCapabilities</scan:ScanResourceType>
			</map:ResourceType>
			<map:Methods>
				<map:Method>	<map:Verb>Get</map:Verb></map:Method>
			</map:Methods>
			<map:XmlElement>
				<scan:ScannerCapabilities xsi:nil="true" /> 
			</map:XmlElement>
		</map:ResourceNode>
		<map:ResourceNode>
			<map:ResourceLink>
				<dd:ResourceURI>/ScannerStatus</dd:ResourceURI>
			</map:ResourceLink>
			<map:ResourceType>
				<scan:ScanResourceType>ScannerStatus</scan:ScanResourceType>
			</map:ResourceType>
			<map:Methods>
				<map:Method>	<map:Verb>Get</map:Verb></map:Method>
			</map:Methods>
			<map:XmlElement>
				<scan:ScannerStatus xsi:nil="true" /> 
			</map:XmlElement>
		</map:ResourceNode>
			<map:ResourceNode>
			<map:ResourceLink>
				<dd:ResourceURI>/ScanBufferInfo</dd:ResourceURI>
			</map:ResourceLink>
			<map:ResourceType>
				<scan:ScanResourceType>ScanBufferInfo</scan:ScanResourceType>
			</map:ResourceType>
			<map:Methods>
				<map:Method>	<map:Verb>Put</map:Verb></map:Method>
			</map:Methods>
			<map:XmlElement>
				<scan:ScanBufferInfo xsi:nil="true" /> 
			</map:XmlElement>
		</map:ResourceNode>
        <map:ResourceNode>
			<map:ResourceLink>
				<dd:ResourceURI>/ScanJobs</dd:ResourceURI>
			</map:ResourceLink>
			<map:ResourceType>
				<scan:ScanResourceType>ScanJobs</scan:ScanResourceType>
			</map:ResourceType>
			<map:Methods>
				<map:Method>	<map:Verb>Post</map:Verb></map:Method>
			</map:Methods>
			<map:XmlElement>
				<scan:ScanSettings xsi:nil="true" /> 
			</map:XmlElement>
			<map:ResourceMap>
				<map:ResourceNode>
					<map:ResourceLink>
						<dd:ResourceURI>/{scan-job-id}</dd:ResourceURI>
						<scan:scan-job-id>xsd:string</scan:scan-job-id>
					</map:ResourceLink>
					<map:ResourceType>
						<scan:ScanResourceType>ScanJob</scan:ScanResourceType>
					</map:ResourceType>
					<map:Methods>
						<map:Method><map:Verb>Delete</map:Verb></map:Method>
					</map:Methods>
					<!--  this section should be included for pull scan only  -->
					<map:ResourceMap>
						<map:ResourceNode>
							<map:ResourceLink>
								<dd:ResourceURI>/NextDocument</dd:ResourceURI>
							</map:ResourceLink>
							<map:ResourceType>
								<scan:ScanResourceType>ScanData</scan:ScanResourceType>
							</map:ResourceType>
							<map:Methods>
								<map:Method><map:Verb>Get</map:Verb></map:Method>
							</map:Methods>
						</map:ResourceNode>
					    <map:ResourceNode>
							<map:ResourceLink>
								<dd:ResourceURI>/ScanImageInfo</dd:ResourceURI>
							</map:ResourceLink>
							<map:ResourceType>
								<scan:ScanResourceType>ScanImageInfo</scan:ScanResourceType>
							</map:ResourceType>
							<map:Methods>
								<map:Method><map:Verb>Get</map:Verb></map:Method>
							</map:Methods>
							<map:XmlElement>
				                <scan:ScanImageInfo xsi:nil="true" /> 
			                </map:XmlElement>
			            </map:ResourceNode>
					</map:ResourceMap>
			    </map:ResourceNode>
			</map:ResourceMap>
		</map:ResourceNode>
         <map:ResourceNode>
			<map:ResourceLink>
				<dd:ResourceURI>/eSCLConfig</dd:ResourceURI>
			</map:ResourceLink>
			<map:ResourceType>
				<scan:ScanResourceType>eSCLConfig</scan:ScanResourceType>
			</map:ResourceType>
			<map:Methods>
				<map:Method>
					<map:Verb>Get</map:Verb>
				</map:Method>
				<map:Method>
					<map:Verb>Put</map:Verb>
					<map:Security>
						<map:SecureAccess>true</map:SecureAccess>
					</map:Security>
				</map:Method>
			</map:Methods>
		</map:ResourceNode>
	</map:ResourceMap>
</man:Manifest>
```

### `GET /eSCL/ScannerCapabilities`

List the scanner capabilities: color entries, scan modes, ADF,…

- 200 OK – Success
- 500 Internal Server Error - Unknown internal error.
- 503 Service Unavailable – Server busy. Retry late

_Request_

```http request
GET /eSCL/ScannerCapabilities HTTP/1.1
HOST: 192.168.0.20
```

_Response_

```http request
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

Returns the current state of the scanner, including active and last job states.

- 200 OK – Success
- 301 Moved - The client is redirected to a secure connection.
- 401 Unauthorized - The client is challenged for access credentials.
- 500 Internal Server Error - Unknown internal error.
- 503 Service Unavailable – Server busy. Retry late

_Request_

```http request
GET /eSCL/ScannerStatus HTTP/1.1
HOST: 192.168.0.20
```

_Response_

```http request
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

Create a scan job

- 201 Created – Location: {JobUri}
- 301 Moved - The client is redirected to a secure connection.
- 400 Bad Request - Request not understood due to wrong syntax
- 401 Unauthorized - The client is challenged for access credentials.
- 409 Conflict – Invalid input settings that conflict the device state or device capabilities or other settings in the
  payload.
- 500 Internal Server Error - Unknown internal error.
- 503 Service Unavailable – Device cannot handle this request at present. Retry later.

_Request_

```http request
POST /eSCL/ScanJobs HTTP/1.1
Accept-Encoding: gzip, deflate
Cache-Control: max-age=0, no-cache
Accept: text/xml
Content-Type: text/plain; charset=UTF-8
Host: 192.168.0.20
Connection: Keep-Alive

<?xml version="1.0" encoding="utf-8"?>
<escl:ScanSettings xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm"
                   xmlns:escl="http://schemas.hp.com/imaging/escl/2011/05/03">
    <pwg:Version>2.5</pwg:Version>
    <escl:Intent>Document</escl:Intent>
    <pwg:ScanRegions pwg:MustHonor="false">
        <pwg:ScanRegion>
            <pwg:Height>3300</pwg:Height>
            <pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits>
            <pwg:Width>2550</pwg:Width>
            <pwg:XOffset>0</pwg:XOffset>
            <pwg:YOffset>0</pwg:YOffset>
        </pwg:ScanRegion>
    </pwg:ScanRegions>
    <escl:DocumentFormatExt>image/jpeg</escl:DocumentFormatExt>
    <pwg:InputSource>Feeder</pwg:InputSource>
    <escl:XResolution>300</escl:XResolution>
    <escl:YResolution>300</escl:YResolution>
    <escl:ColorMode>RGB24</escl:ColorMode>
    <escl:CompressionFactor>0</escl:CompressionFactor>
</escl:ScanSettings>
```

_Response_

```http request
HTTP/1.1 201 Created
Server: HP HTTP Server; HP PageWide Pro 477dw MFP - D3Q20B; Serial Number: CN136MX02P; Built: Wed Oct 13, 2021 07:50:14PM {MAVEDWPP1N001.2142A.00}
Location: http://192.168.0.20/eSCL/ScanJobs/1cdb8df1-2898-1f0a-9962-3822e23ba011
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache

```

### `GET /eSCL/ScanJobs/1cdb8df1-2898-1f0a-9962-3822e23ba011/NextDocument`

Upload the next scan document (text or photo), using the scan job settings

- 200 OK – Success: complete payload transmitted
- 301 Moved - The client is redirected to a secure connection.
- 401 Unauthorized - The client is challenged for access credentials.
- 404 Not Found – no more page. The last page has already been transmitted.
- 410 Gone – the scan job doesn’t exist anymore. May want to check the status.
- 500 Internal Server Error - Unknown internal error.
- 503 Service Unavailable – the job is active, but the scanner can’t return the payload at the moment. Retry later.

_Request_

```http request
GET /eSCL/ScanJobs/1cdb8df1-2898-1f0a-9962-3822e23ba011/NextDocument HTTP/1.1
Accept-Encoding: gzip, deflate
Cache-Control: max-age=0, no-cache
Accept: text/xml
Host: 192.168.0.20
Connection: Keep-Alive
TE: chunked
```

_Response_

```http request
HTTP/1.1 200 OK
Server: HP HTTP Server; HP PageWide Pro 477dw MFP - D3Q20B; Serial Number: CN136MX02P; Built: Wed Oct 13, 2021 07:50:14PM {MAVEDWPP1N001.2142A.00}
Content-Type: image/jpeg
Cache-Control: max-age=180
Transfer-Encoding: chunked
Content-Location: /eSCL/ScanJobs/893e6fcd-487f-4056-a8c9-a87709b85daf/photo-1

...
```

### `GET /eSCL/ScanJobs/1cdb8df1-2898-1f0a-9962-3822e23ba011/ScanImageInfo`

Retrieve the scan image info for the most recent scan page retrieved

- 200 OK – Success:
- 301 Moved - The client is redirected to a secure connection.
- 401 Unauthorized - The client is challenged for access credentials.
- 404 Not Found – ScanImageInfo is no more available for the recent scan page. The info has already been transmitted.
- 410 Gone – the scan job doesn’t exist anymore. May want to check the status.
- 500 Internal Server Error - Unknown internal error.
- 503 Service Unavailable – the job is active, but the scanner can’t return the buffer info at the moment. Retry later.

_Request_

```http request
GET /eSCL/ScanJobs/1cdb8df1-2898-1f0a-9962-3822e23ba011/ScanImageInfo HTTP/1.1
Accept-Encoding: gzip, deflate
Cache-Control: max-age=0, no-cache
Accept: text/xml
Host: 192.168.0.20
Connection: Keep-Alive
```

_Response_

```http request
HTTP/1.1 200 OK
Server: HP HTTP Server; HP PageWide Pro 477dw MFP - D3Q20B; Serial Number: CN136MX02P; Built: Wed Oct 13, 2021 07:50:14PM {MAVEDWPP1N001.2142A.00}
Content-Type: text/xml
Transfer-Encoding: chunked
Content-Encoding: gzip
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<scan:ScanImageInfo xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://schemas.hp.com/imaging/escl/2011/05/03 ../../schemas/eSCL.xsd">
	<pwg:JobUri>/eSCL/ScanJobs/1ca435c6-3c75-1f09-99ab-3822e23ba011</pwg:JobUri>
	<pwg:JobUuid>1ca435c6-3c75-1f09-99ab-3822e23ba011</pwg:JobUuid>
	<scan:ActualWidth>2550</scan:ActualWidth>
	<scan:ActualHeight>3300</scan:ActualHeight>
	<scan:ActualBytesPerLine>7650</scan:ActualBytesPerLine>
</scan:ScanImageInfo>
```

## Untested

### `DELETE /eSCL/ScanJobs/893e6fcd-487f-4056-a8c9-a87709b85daf`

Cancel a scan job

- 200 OK – Success
- 301 Moved - The client is redirected to a secure connection.
- 401 Unauthorized - The client is challenged for access credentials.
- 404 Not Found - Resource is not found.
- 410 Gone - The resource used to exist, but is gone.
- 500 Internal Server Error - Unknown internal error.
- 503 Service Unavailable – Server busy. Retry later

_Request_

```http request
DELETE /eSCL/ScanJobs/893e6fcd-487f-4056-a8c9-a87709b85daf HTTP/1.1
Host: 192.168.0.20
```

_Response_

```http request
HTTP/1.1 200 OK
Server: HP HTTP Server; HP PageWide Pro 477dw MFP - D3Q20B; Serial Number: CN136MX02P; Built: Wed Oct 13, 2021 07:50:14PM {MAVEDWPP1N001.2142A.00}
Pragma: no-cache
```

### `PUT /eSCL/ScanBufferInfo`

Submit a set of scan settings, and expect the server to validate the settings and return an estimation of the future
scan image size. Note that this resource is available outside a job context. This query should work even if the scanner
is processing a job from a different application or client computer

- 200 OK – Success
- 400 Bad Request – Request not understood due to wrong syntax
- 409 Conflict – Invalid input
- 500 Internal Server Error - Unknown internal error.
- 503 Service Unavailable – Server busy. Retry later

_Request_

```http request
PUT /eSCL/ScanBufferInfo HTTP/1.1
Host: 192.168.0.20
Content-Type: text/xml

<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
    <pwg:Version>2.6</pwg:Version>
    <scan:Intent>Photo</scan:Intent>
    <pwg:ScanRegions>
        <pwg:ScanRegion>
            <pwg:Height>1200</pwg:Height>
            <pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits>
            <pwg:Width>1800</pwg:Width>
            <pwg:XOffset>0</pwg:XOffset>
            <pwg:YOffset>0</pwg:YOffset>
        </pwg:ScanRegion>
    </pwg:ScanRegions>
    <pwg:InputSource>Platen</pwg:InputSource>
    <scan:ColorMode>Grayscale8</scan:ColorMode>
</scan:ScanSettings>

```

_Response_

```http request
HTTP/1.1 200 OK
Server: HP HTTP Server; HP PageWide Pro 477dw MFP - D3Q20B; Serial Number: CN136MX02P; Built: Wed Oct 13, 2021 07:50:14PM {MAVEDWPP1N001.2142A.00}
Content-Type: text/xml
Transfer-Encoding: chunked
Content-Encoding: gzip
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache

<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanBufferInfo
        xsi:schemaLocation="http://schemas.hp.com/imaging/escl/2011/05/03 eSCL.xsd"
        xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03"
        xmlns:httpdest="http://schemas.hp.com/imaging/httpdestination/2011/10/13"
        xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <scan:ScanSettings>
        <pwg:Version>2.6</pwg:Version>
        <scan:Intent>Photo</scan:Intent>
        <pwg:ScanRegions>
            <pwg:ScanRegion>
                <pwg:Height>1200</pwg:Height>
                <pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits>
                <pwg:Width>1800</pwg:Width>
                <pwg:XOffset>0</pwg:XOffset>
                <pwg:YOffset>0</pwg:YOffset>
            </pwg:ScanRegion>
        </pwg:ScanRegions>
        <scan:DocumentFormatExt>image/jpeg
        </scan:DocumentFormatExt>
        <pwg:ContentType>Photo</pwg:ContentType>
        <pwg:InputSource>Platen</pwg:InputSource>
        <scan:XResolution>300</scan:XResolution>
        <scan:YResolution>300</scan:YResolution>
        <scan:ColorMode>Grayscale8</scan:ColorMode>
        <scan:ColorSpace>YCC</scan:ColorSpace>
        <scan:CcdChannel>GrayCcdEmulated</scan:CcdChannel>
        <scan:BinaryRendering>Threshold</scan:BinaryRendering>
    </scan:ScanSettings>
    <scan:ImageWidth>1200</scan:ImageWidth>
    <scan:ImageHeight>1800</scan:ImageHeight>
    <scan:BytesPerLine>1500</scan:BytesPerLine>
</scan:ScanBufferInfo>

```