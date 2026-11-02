* [Protocol](https://www.google.com/search?q=%23protocol)
* [Recorded Sequence](https://www.google.com/search?q=%23recorded-sequence)
* [`POST /eSCL/WalkupSubscriptions`](https://www.google.com/search?q=%23post-esclwalkupsubscriptions)
* [`GET /eSCL/WalkupSubscriptions/{id}/Event`](https://www.google.com/search?q=%23get-esclwalkupsubscriptionsidevent)
* [`GET /eSCL/eSCLConfig`](https://www.google.com/search?q=%23get-esclesclconfig)
* [`GET /eSCL/ScannerCapabilities`](https://www.google.com/search?q=%23get-esclscannercapabilities)
* [`GET /eSCL/ScannerStatus`](https://www.google.com/search?q=%23get-esclscannerstatus)
* [`POST /eSCL/ScanJobs`](https://www.google.com/search?q=%23post-esclscanjobs)
* [`GET /eSCL/ScanJobs/{id}/NextDocument`](https://www.google.com/search?q=%23get-esclscanjobsidnextdocument)
* [`GET /eSCL/ScanJobs/{id}/ScanImageInfo`](https://www.google.com/search?q=%23get-esclscanjobsidscanimageinfo)
* [`DELETE /eSCL/WalkupSubscriptions/{id}`](https://www.google.com/search?q=%23delete-esclwalkupsubscriptionsid)




* [Key Operational Notes](https://www.google.com/search?q=%23key-operational-notes)

# Protocol

Walkup Scan (Scan to Computer) protocol traces captured for **HP OfficeJet Pro 8120e Series (HP OfficeJet Pro 8122e)** over HTTPS (`:443`) using eSCL (Windows HP Scan to Computer).

## Recorded Sequence

The sequence demonstrates registering a client destination on the printer, listening for touchscreen events via long polling, querying device state, triggering a scan job upon user interaction at the panel, retrieving image data, and handling subscription cleanup.

---

### `POST /eSCL/WalkupSubscriptions`

Registers the host computer as a destination in the printer's touchscreen menu, along with configured shortcuts.

*Request*

```http
POST /eSCL/WalkupSubscriptions HTTP/1.1
HOST: 192.168.2.199:443
User-Agent: HP
Cache-Control: no-cache
Content-Type: text/xml
Content-Length: 589
Connection: Keep-Alive

<?xml version="1.0" encoding="UTF-8"?>
<WalkupScanSubscription xmlns="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://schemas.hp.com/imaging/escl/2011/05/03 eSCL.xsd">
	<HostIdentifier>Mobin-Laptop (DESKTOP-GT6IN7I)</HostIdentifier>
	<Connection>Network</Connection>
	<Shortcuts>
		<Shortcut>Save as PDF</Shortcut>
		<Shortcut>Save as JPEG</Shortcut>
		<Shortcut>Email as PDF</Shortcut>
		<Shortcut>Everyday Scan</Shortcut>
		<Shortcut>Paperless</Shortcut>
	</Shortcuts>
</WalkupScanSubscription>

```

*Response*

```http
HTTP/1.1 201 Created
Server: nginx
Date: Mon, 02 Nov 2026 17:13:13 GMT
Location: /eSCL/WalkupSubscriptions/108b7a10-43ef-44b0-97ab-ea2f1274de50        # Here you can see the unique subscription ID returned by the printer
Strict-Transport-Security: max-age=31536000; includeSubDomains
Cache-Control: no-store, max-age=0
Content-Length: 0

```

---

### `GET /eSCL/WalkupSubscriptions/{id}/Event`

Long-polls the printer for events initiated on the control panel.

*Request*

```http
GET /eSCL/WalkupSubscriptions/108b7a10-43ef-44b0-97ab-ea2f1274de50/Event?timeout=100 HTTP/1.1
HOST: 192.168.2.199:443
User-Agent: HP
Connection: Keep-Alive

```

*Response (Timeout / No Event)*

```http
HTTP/1.1 204 No Content
Server: nginx
Date: Mon, 02 Nov 2026 17:13:24 GMT
Cache-Control: no-store, max-age=0

```

*Response (User selected computer on touchscreen)*

```http
HTTP/1.1 200 OK
Server: nginx
Date: Mon, 02 Nov 2026 18:03:58 GMT
Content-Type: text/xml
Content-Length: 561
Cache-Control: no-store, max-age=0

<?xml version="1.0"?>
<scan:WalkupScanEvent xmlns:dest="http://schemas.hp.com/imaging/httpdestination/2011/10/13" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm" xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<scan:ResourceURI>/eSCL/WalkupSubscriptions/108b7a10-43ef-44b0-97ab-ea2f1274de50</scan:ResourceURI>
	<scan:HostIdentifier>Mobin-Laptop (DESKTOP-GT6IN7I)</scan:HostIdentifier>
	<scan:Connection>Network</scan:Connection>
	<scan:Event>HostSelected</scan:Event>
</scan:WalkupScanEvent>

```

*Response (User selected shortcut and pressed Start Scan)*

```http
HTTP/1.1 200 OK
Server: nginx
Date: Mon, 02 Nov 2026 18:04:46 GMT
Content-Type: text/xml
Content-Length: 909
Cache-Control: no-store, max-age=0

<?xml version="1.0"?>
<scan:WalkupScanEvent xmlns:dest="http://schemas.hp.com/imaging/httpdestination/2011/10/13" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm" xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<scan:ResourceURI>/eSCL/WalkupSubscriptions/108b7a10-43ef-44b0-97ab-ea2f1274de50</scan:ResourceURI>
	<scan:HostIdentifier>Mobin-Laptop (DESKTOP-GT6IN7I)</scan:HostIdentifier>
	<scan:Connection>Network</scan:Connection>
	<scan:Event>ScanRequested</scan:Event>
	<scan:Shortcut>Paperless</scan:Shortcut>
	<scan:ScanSettings>
		<pwg:Version>2.4</pwg:Version>
		<scan:XResolution>300</scan:XResolution>                # user can change the resolution on the touchscreen panel, but I did not test that feature
		<scan:YResolution>300</scan:YResolution>
		<scan:Duplex>false</scan:Duplex>                        # This printer does not support duplex scanning so I could not test that feature
		<scan:Brightness>4</scan:Brightness>
		<scan:ContentOrientation>Portrait</scan:ContentOrientation>
	</scan:ScanSettings>
</scan:WalkupScanEvent>

```

*Response (All pages scanned / transaction finished)*

```http
HTTP/1.1 200 OK
Server: nginx
Date: Mon, 02 Nov 2026 18:03:57 GMT
Content-Type: text/xml
Content-Length: 566
Cache-Control: no-store, max-age=0

<?xml version="1.0"?>
<scan:WalkupScanEvent xmlns:dest="http://schemas.hp.com/imaging/httpdestination/2011/10/13" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm" xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<scan:ResourceURI>/eSCL/WalkupSubscriptions/108b7a10-43ef-44b0-97ab-ea2f1274de50</scan:ResourceURI>
	<scan:HostIdentifier>Mobin-Laptop (DESKTOP-GT6IN7I)</scan:HostIdentifier>
	<scan:Connection>Network</scan:Connection>
	<scan:Event>ScanPagesComplete</scan:Event>
</scan:WalkupScanEvent>

```

---

### `GET /eSCL/eSCLConfig`

Queries eSCL protocol state configuration.

*Request*

```http
GET /eSCL/eSCLConfig HTTP/1.1
HOST: 192.168.2.199:443
User-Agent: HP
Connection: Keep-Alive

```

*Response*

```http
HTTP/1.1 200 OK
Server: nginx
Date: Mon, 02 Nov 2026 18:03:57 GMT
Content-Type: text/xml
Content-Length: 333
Cache-Control: no-store, max-age=0

<?xml version="1.0"?>
<scan:eSCLConfig xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm" xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<scan:State>enabled</scan:State>
	<scan:NonNetworkStoredJobRequest>disabled</scan:NonNetworkStoredJobRequest>
</scan:eSCLConfig>

```

---

### `GET /eSCL/ScannerCapabilities`

Retrieves scanner hardware limits (resolutions, document formats, platen vs ADF capabilities, max walkup destinations, and timeout defaults).

*Request*

```http
GET /eSCL/ScannerCapabilities HTTP/1.1
HOST: 192.168.2.199:443
User-Agent: HP
Connection: Keep-Alive

```

*Response*

```http
HTTP/1.1 200 OK
Server: nginx
Content-Type: text/xml
Cache-Control: no-store, max-age=0

<?xml version="1.0"?>
<scan:ScannerCapabilities xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm" xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<pwg:Version>2.9</pwg:Version>
	<pwg:MakeAndModel>HP OfficeJet Pro 8120e series</pwg:MakeAndModel>
	<pwg:SerialNumber>TH654SQ0BW</pwg:SerialNumber>
	<scan:Manufacturer>HP</scan:Manufacturer>
	<scan:Certifications>
		<scan:Certification>
			<scan:Name>mopria-certified-scan</scan:Name>
			<scan:Version>1.5</scan:Version>
		</scan:Certification>
	</scan:Certifications>
	<scan:UUID>4bf24427-71db-4c54-b8f7-975e6419cd50</scan:UUID>
	<scan:AdminURI>http://HPB887885A6312.local.</scan:AdminURI>
	<scan:IconURI>http://HPB887885A6312.local./images/printer.png</scan:IconURI>
	<scan:SettingProfiles>
		<scan:SettingProfile>
			<scan:ColorModes>
				<scan:ColorMode>BlackAndWhite1</scan:ColorMode>
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
				<pwg:DocumentFormat>application/pdf</pwg:DocumentFormat>
				<pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat>
				<pwg:DocumentFormat>image/tiff</pwg:DocumentFormat>
				<scan:DocumentFormatExt>application/octet-stream</scan:DocumentFormatExt>
				<scan:DocumentFormatExt>application/pdf</scan:DocumentFormatExt>
				<scan:DocumentFormatExt>image/jpeg</scan:DocumentFormatExt>
				<scan:DocumentFormatExt>image/tiff</scan:DocumentFormatExt>
			</scan:DocumentFormats>
			<scan:SupportedResolutions>
				<scan:DiscreteResolutions>
					<scan:DiscreteResolution>
						<scan:XResolution>75</scan:XResolution>
						<scan:YResolution>75</scan:YResolution>
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
						<scan:XResolution>600</scan:XResolution>
						<scan:YResolution>600</scan:YResolution>
					</scan:DiscreteResolution>
				</scan:DiscreteResolutions>
			</scan:SupportedResolutions>
			<scan:ColorSpaces>
				<scan:ColorSpace>RGB</scan:ColorSpace>
			</scan:ColorSpaces>
		</scan:SettingProfile>
	</scan:SettingProfiles>
	<scan:Platen>
		<scan:PlatenInputCaps>
			<scan:MinWidth>64</scan:MinWidth>
			<scan:MaxWidth>2550</scan:MaxWidth>
			<scan:MinHeight>8</scan:MinHeight>
			<scan:MaxHeight>3508</scan:MaxHeight>
			<scan:MinPageWidth>0</scan:MinPageWidth>
			<scan:MinPageHeight>0</scan:MinPageHeight>
			<scan:MaxScanRegions>10</scan:MaxScanRegions>
			<scan:SettingProfiles>
				<scan:SettingProfile>
					<scan:ColorModes>
						<scan:ColorMode>BlackAndWhite1</scan:ColorMode>
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
						<pwg:DocumentFormat>application/pdf</pwg:DocumentFormat>
						<pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat>
						<pwg:DocumentFormat>image/tiff</pwg:DocumentFormat>
						<scan:DocumentFormatExt>application/octet-stream</scan:DocumentFormatExt>
						<scan:DocumentFormatExt>application/pdf</scan:DocumentFormatExt>
						<scan:DocumentFormatExt>image/jpeg</scan:DocumentFormatExt>
						<scan:DocumentFormatExt>image/tiff</scan:DocumentFormatExt>
					</scan:DocumentFormats>
					<scan:SupportedResolutions>
						<scan:DiscreteResolutions>
							<scan:DiscreteResolution>
								<scan:XResolution>75</scan:XResolution>
								<scan:YResolution>75</scan:YResolution>
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
						<scan:ColorSpace>RGB</scan:ColorSpace>
					</scan:ColorSpaces>
				</scan:SettingProfile>
			</scan:SettingProfiles>
			<scan:SupportedIntents>
				<scan:Intent>Document</scan:Intent>
				<scan:Intent>TextAndGraphic</scan:Intent>
				<scan:Intent>Photo</scan:Intent>
				<scan:Intent>Preview</scan:Intent>
			</scan:SupportedIntents>
			<scan:MaxOpticalXResolution>1200</scan:MaxOpticalXResolution>
			<scan:MaxOpticalYResolution>1200</scan:MaxOpticalYResolution>
			<scan:RiskyLeftMargin>30</scan:RiskyLeftMargin>
			<scan:RiskyRightMargin>30</scan:RiskyRightMargin>
			<scan:RiskyTopMargin>30</scan:RiskyTopMargin>
			<scan:RiskyBottomMargin>44</scan:RiskyBottomMargin>
			<scan:MaxPhysicalWidth>297</scan:MaxPhysicalWidth>
			<scan:MaxPhysicalHeight>420</scan:MaxPhysicalHeight>
			<scan:SupportedMediaTypes>
				<scan:MediaType>White</scan:MediaType>
				<scan:MediaType>Photo</scan:MediaType>
			</scan:SupportedMediaTypes>
		</scan:PlatenInputCaps>
	</scan:Platen>
	<scan:Adf>
		<scan:AdfSimplexInputCaps>
			<scan:MinWidth>1500</scan:MinWidth>
			<scan:MaxWidth>2550</scan:MaxWidth>
			<scan:MinHeight>1500</scan:MinHeight>
			<scan:MaxHeight>4200</scan:MaxHeight>
			<scan:MinPageWidth>0</scan:MinPageWidth>
			<scan:MinPageHeight>0</scan:MinPageHeight>
			<scan:MaxScanRegions>1</scan:MaxScanRegions>
			<scan:SettingProfiles>
				<scan:SettingProfile>
					<scan:ColorModes>
						<scan:ColorMode>BlackAndWhite1</scan:ColorMode>
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
						<pwg:DocumentFormat>application/pdf</pwg:DocumentFormat>
						<pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat>
						<pwg:DocumentFormat>image/tiff</pwg:DocumentFormat>
						<scan:DocumentFormatExt>application/octet-stream</scan:DocumentFormatExt>
						<scan:DocumentFormatExt>application/pdf</scan:DocumentFormatExt>
						<scan:DocumentFormatExt>image/jpeg</scan:DocumentFormatExt>
						<scan:DocumentFormatExt>image/tiff</scan:DocumentFormatExt>
					</scan:DocumentFormats>
					<scan:SupportedResolutions>
						<scan:DiscreteResolutions>
							<scan:DiscreteResolution>
								<scan:XResolution>75</scan:XResolution>
								<scan:YResolution>75</scan:YResolution>
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
						<scan:ColorSpace>RGB</scan:ColorSpace>
					</scan:ColorSpaces>
				</scan:SettingProfile>
			</scan:SettingProfiles>
			<scan:SupportedIntents>
				<scan:Intent>Document</scan:Intent>
				<scan:Intent>TextAndGraphic</scan:Intent>
				<scan:Intent>Photo</scan:Intent>
				<scan:Intent>Preview</scan:Intent>
			</scan:SupportedIntents>
			<scan:EdgeAutoDetection>
				<scan:SupportedEdge>BottomEdge</scan:SupportedEdge>
			</scan:EdgeAutoDetection>
			<scan:MaxOpticalXResolution>300</scan:MaxOpticalXResolution>
			<scan:MaxOpticalYResolution>300</scan:MaxOpticalYResolution>
			<scan:RiskyLeftMargin>16</scan:RiskyLeftMargin>
			<scan:RiskyTopMargin>35</scan:RiskyTopMargin>
			<scan:MaxPhysicalWidth>297</scan:MaxPhysicalWidth>
			<scan:MaxPhysicalHeight>420</scan:MaxPhysicalHeight>
			<scan:SupportedMediaTypes>
				<scan:MediaType>White</scan:MediaType>
				<scan:MediaType>Photo</scan:MediaType>
			</scan:SupportedMediaTypes>
		</scan:AdfSimplexInputCaps>
		<scan:FeederCapacity>35</scan:FeederCapacity>
		<scan:Justification>
			<pwg:XImagePosition>Left</pwg:XImagePosition>
			<pwg:YImagePosition>Top</pwg:YImagePosition>
		</scan:Justification>
		<scan:AdfOptions>
			<scan:AdfOption>DetectPaperLoaded</scan:AdfOption>
		</scan:AdfOptions>
	</scan:Adf>
	<scan:WalkupScanSupport>
		<scan:MaxNetworkDestinations>10</scan:MaxNetworkDestinations>
		<scan:InactivityTimeout>240</scan:InactivityTimeout>
		<scan:SubscriptionTimeout>3600</scan:SubscriptionTimeout>
		<scan:MaxScanShortcuts>5</scan:MaxScanShortcuts>
		<scan:PINSupport>false</scan:PINSupport>
	</scan:WalkupScanSupport>
	<scan:BrightnessSupport>
		<scan:Min>0</scan:Min>
		<scan:Max>8</scan:Max>
		<scan:Normal>4</scan:Normal>
		<scan:Step>1</scan:Step>
	</scan:BrightnessSupport>
	<scan:CompressionFactorSupport>
		<scan:Min>0</scan:Min>
		<scan:Max>100</scan:Max>
		<scan:Normal>50</scan:Normal>
		<scan:Step>1</scan:Step>
	</scan:CompressionFactorSupport>
	<scan:ContrastSupport>
		<scan:Min>0</scan:Min>
		<scan:Max>8</scan:Max>
		<scan:Normal>4</scan:Normal>
		<scan:Step>1</scan:Step>
	</scan:ContrastSupport>
	<scan:SharpenSupport>
		<scan:Min>0</scan:Min>
		<scan:Max>4</scan:Max>
		<scan:Normal>2</scan:Normal>
		<scan:Step>1</scan:Step>
	</scan:SharpenSupport>
	<scan:ThresholdSupport>
		<scan:Min>0</scan:Min>
		<scan:Max>100</scan:Max>
		<scan:Normal>50</scan:Normal>
		<scan:Step>1</scan:Step>
	</scan:ThresholdSupport>
	<scan:eSCLConfigCap>
		<scan:StateSupport>
			<scan:State>enabled</scan:State>
			<scan:State>disabled</scan:State>
		</scan:StateSupport>
		<scan:NonNetworkStoredJobRequestSupport>
			<scan:State>enabled</scan:State>
		</scan:NonNetworkStoredJobRequestSupport>
		<scan:ScannerAdminCredentialsSupport>false</scan:ScannerAdminCredentialsSupport>
	</scan:eSCLConfigCap>
	<scan:JobSourceInfoSupport>true</scan:JobSourceInfoSupport>
</scan:ScannerCapabilities>

```

---

### `GET /eSCL/ScannerStatus`

Fetches scanner readiness, paper tray status, ADF status, and active/completed job status list.

*Request*

```http
GET /eSCL/ScannerStatus HTTP/1.1
HOST: 192.168.2.199:443
User-Agent: HP
Connection: Keep-Alive

```

*Response (ADF Loaded Example)*

```http
HTTP/1.1 200 OK
Server: nginx
Date: Mon, 02 Nov 2026 17:59:16 GMT
Content-Type: text/xml
Content-Length: 3186
Cache-Control: no-store, max-age=0

<?xml version="1.0"?>
<scan:ScannerStatus xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm" xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<pwg:Version>2.9</pwg:Version>
	<pwg:State>Idle</pwg:State>
	<scan:AdfState>ScannerAdfLoaded</scan:AdfState>
	<scan:Jobs>
		<scan:JobInfo>
			<pwg:JobUri>/eSCL/ScanJobs/0dd60056-ebc3-48f9-8933-2917c47a2960</pwg:JobUri>
			<pwg:JobUuid>0dd60056-ebc3-48f9-8933-2917c47a2960</pwg:JobUuid>
			<scan:Age>12</scan:Age>
			<pwg:ImagesCompleted>3</pwg:ImagesCompleted>
			<pwg:ImagesToTransfer>0</pwg:ImagesToTransfer>
			<pwg:JobState>Completed</pwg:JobState>
			<pwg:JobStateReasons>
				<pwg:JobStateReason>JobCompletedSuccessfully</pwg:JobStateReason>
			</pwg:JobStateReasons>
		</scan:JobInfo>
	</scan:Jobs>
</scan:ScannerStatus>

```

---

### `POST /eSCL/ScanJobs`

Submits a scan job following a `ScanRequested` panel event.

*Request*

```http
POST /eSCL/ScanJobs HTTP/1.1
HOST: 192.168.2.199:443
User-Agent: HP
Cache-Control: no-cache
Content-Type: text/xml
Content-Length: 1343
Connection: Keep-Alive

<?xml version="1.0" encoding="UTF-8"?>
<ScanSettings xmlns="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://schemas.hp.com/imaging/escl/2011/05/03 Scan Schema - 0.26.xsd">
	<Version xmlns="http://www.pwg.org/schemas/2010/12/sm">2.9</Version>
	<ContextID>108b7a10-43ef-44b0-97ab-ea2f1274de50</ContextID>
	<Intent>Document</Intent>
	<ScanRegions xmlns="http://www.pwg.org/schemas/2010/12/sm" xmlns:n0="http://www.pwg.org/schemas/2010/12/sm" n0:MustHonor="false">
		<ScanRegion>
			<Height>4200</Height>
			<Width>2550</Width>
			<XOffset>0</XOffset>
			<YOffset>0</YOffset>
			<ContentRegionUnits>escl:ThreeHundredthsOfInches</ContentRegionUnits>
		</ScanRegion>
	</ScanRegions>
	<DocumentFormatExt>image/jpeg</DocumentFormatExt>
	<InputSource xmlns="http://www.pwg.org/schemas/2010/12/sm">Feeder</InputSource>
	<XResolution>300</XResolution>
	<YResolution>300</YResolution>
	<ColorMode>RGB24</ColorMode>
	<Brightness>4</Brightness>
	<CompressionFactor>50</CompressionFactor>
	<Contrast>4</Contrast>
	<JobSourceInfo>
		<UserName>LOCAL SERVICE</UserName>
		<UserDomain></UserDomain>
		<MachineName>MOBIN-PC</MachineName>
		<AppFileName>svchost.exe</AppFileName>
		<Application>WIA client</Application>
	</JobSourceInfo>
</ScanSettings>

```

*Response*

```http
HTTP/1.1 201 Created
Server: nginx
Date: Mon, 02 Nov 2026 17:59:25 GMT
Location: https://192.168.2.199:443/eSCL/ScanJobs/3c3bd9e8-f633-4a06-8126-f3de961ea9e9
Cache-Control: no-store, max-age=0
Content-Length: 0

```

---

### `GET /eSCL/ScanJobs/{id}/NextDocument`

Downloads the binary image data for the current page.

*Request*

```http
GET /eSCL/ScanJobs/3c3bd9e8-f633-4a06-8126-f3de961ea9e9/NextDocument HTTP/1.1
HOST: 192.168.2.199:443
User-Agent: HP
Connection: Keep-Alive

```

*Response (Still scanning / digitizing page)*

```http
HTTP/1.1 503 Service Unavailable
Server: nginx
Date: Mon, 02 Nov 2026 17:59:25 GMT
Cache-Control: no-store, max-age=0
Content-Length: 0

```

*Response (Page ready - Binary chunked stream)*

```http
HTTP/1.1 200 OK
Server: nginx
Date: Mon, 02 Nov 2026 17:59:45 GMT
Content-Type: image/jpeg
Transfer-Encoding: chunked
Cache-Control: no-store, max-age=0

7b3f0
\xff\xd8\xff\xe0... <binary JPEG payload>

```

*Response (No more pages left in job)*

```http
HTTP/1.1 404 Not Found
Server: nginx
Date: Mon, 02 Nov 2026 18:00:33 GMT
Cache-Control: no-store, max-age=0
Content-Length: 0

```

---

### `GET /eSCL/ScanJobs/{id}/ScanImageInfo`

Retrieves physical dimensions and pixel metrics of the scanned page image.

*Request*

```http
GET /eSCL/ScanJobs/3c3bd9e8-f633-4a06-8126-f3de961ea9e9/ScanImageInfo HTTP/1.1
HOST: 192.168.2.199:443
User-Agent: HP
Connection: Keep-Alive

```

*Response*

```http
HTTP/1.1 200 OK
Server: nginx
Date: Mon, 02 Nov 2026 17:59:46 GMT
Content-Type: text/xml
Content-Length: 548
Cache-Control: no-store, max-age=0

<?xml version="1.0"?>
<scan:ScanImageInfo xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm" xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<pwg:Version>2.4</pwg:Version>
	<pwg:JobUri>/eSCL/ScanJobs/3c3bd9e8-f633-4a06-8126-f3de961ea9e9</pwg:JobUri>
	<pwg:JobUuid>3c3bd9e8-f633-4a06-8126-f3de961ea9e9</pwg:JobUuid>
	<scan:ActualWidth>2550</scan:ActualWidth>
	<scan:ActualHeight>3518</scan:ActualHeight>
	<scan:ActualBytesPerLine>7650</scan:ActualBytesPerLine>
</scan:ScanImageInfo>

```

---

### `DELETE /eSCL/WalkupSubscriptions/{id}`

Unregisters the host client subscription from the printer, removing it from the control panel destination list.
this is very useful if you want to add new shortcuts or change the shortcut names, because you cannot update the shortcuts in an existing subscription. You have to delete the subscription and create a new one with the updated shortcuts.

*Request*

```http
DELETE /eSCL/WalkupSubscriptions/108b7a10-43ef-44b0-97ab-ea2f1274de50 HTTP/1.1
HOST: 192.168.2.199:443
User-Agent: HP
Connection: Keep-Alive

```

*Response*

```http
HTTP/1.1 200 OK
Server: nginx
Date: Mon, 02 Nov 2026 18:05:00 GMT
Content-Length: 0
Cache-Control: no-store, max-age=0

```

---

# Key Operational Notes

1. **Shortcut Management & Dynamic UI**:
* Shortcuts registered inside `<Shortcuts>` during `POST /eSCL/WalkupSubscriptions` appear on the printer's touchscreen under the selected computer destination.
* Up to 5 shortcuts are supported (`<scan:MaxScanShortcuts>5</scan:MaxScanShortcuts>`).


2. **Subscription Teardown & Updates**:
* To update shortcut labels or disable Walkup Scan on the host client, the application issues an HTTP `DELETE` to `/eSCL/WalkupSubscriptions/{subscription_id}`.
* To re-configure options, the client sends `DELETE` first, followed by a new `POST /eSCL/WalkupSubscriptions` containing the revised shortcut set.


3. **HTTPS & Port Usage**:
* Modern HP eSCL implementations execute Walkup Scan subscriptions over HTTPS (`443`) rather than plaintext HTTP (`8080`).