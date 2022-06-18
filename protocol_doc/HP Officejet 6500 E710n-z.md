<!-- TOC -->

- [Protocol](downgraded)
    - [Recorded Sequence](#recorded-sequence)
        - [`GET /WalkupScanToComp/WalkupScanToCompCaps`](#get-walkupscantocompwalkupscantocompcaps)
        - [`GET /WalkupScan/WalkupScanDestinations`](#get-walkupscanwalkupscandestinations)
        - [`POST /WalkupScan/WalkupScanDestinations`](#post-walkupscanwalkupscandestinations)
        - [`GET /EventMgmt/EventTable`](#get-eventmgmteventtable)
        - [`GET /EventMgmt/EventTable?timeout=1200`](#get-eventmgmteventtabletimeout1200)
        - [`GET /WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113`](#get-walkupscanwalkupscandestinations1cb3125d-7bde-1f09-8da2-2c768ab21113)
        - [`GET /DevMgmt/DiscoveryTree.xml`](#get-devmgmtdiscoverytreexml)
        - [`GET /Scan/ScanCaps.xml`](#get-scanscancapsxml)
        - [`GET /Scan/Status`](#get-scanstatus)
        - [`GET /WalkupScan/WalkupScanDestinations`](#get-walkupscanwalkupscandestinations-1)
        - [`GET /WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113`](#get--http192168178080walkupscanwalkupscandestinations1cb3125d-7bde-1f09-8da2-2c768ab21113)
        - [`GET /WalkupScan/WalkupScanDestinations`](#get-walkupscanwalkupscandestinations-2)
        - [`GET /EventMgmt/EventTable`](#get-eventmgmteventtable-1)
        - [`GET /Scan/Status`](#get-scanstatus-1)
        - [`GET /WalkupScan/WalkupScanDestinations`](#get-walkupscanwalkupscandestinations-3)
        - [`GET /WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113`](#get-http192168178080walkupscanwalkupscandestinations1cb3125d-7bde-1f09-8da2-2c768ab21113)
        - [`GET /WalkupScan/WalkupScanDestinations`](#get-walkupscanwalkupscandestinations-4)
        - [`GET /EventMgmt/EventTable`](#get-eventmgmteventtable-2)
        - [`GET /Scan/Status (4 times)`](#get-scanstatus-4-times)
        - [`POST /Scan/Jobs`](#post-scanjobs)
        - [`GET /Jobs/JobList/2 (55 times)`](#get-jobsjoblist2-55-times)
        - [`GET /Scan/Jobs/2/Pages/1`](#get-scanjobs2pages1)
        - [`GET /Jobs/JobList/2 (2 times)`](#get-jobsjoblist2-2-times)
        - [`GET /Scan/Status`](#get-scanstatus-2)
        - [`GET /EventMgmt/EventTable?timeout=1200`](#get-eventmgmteventtabletimeout1200-1)
        - [`GET /EventMgmt/EventTable?timeout=1192`](#get-eventmgmteventtabletimeout1192)

- [See Also](#see-also)

<!-- /TOC -->

# Protocol

Scan to computer for `HP Officejet 6500 E710n-z` recorder on a Windows 10 computer.

## Recorded Sequence

A single sheet was prepared in the tray. The `scan to computer` has never been activated on the host.

Rapidly after launching the desktop application a `Scan to PDF` was triggered from the printer's screen.

### `GET /WalkupScanToComp/WalkupScanToCompCaps`

This examines if the further API calls have to use the API WalkupScan or WalkupScanToComp. If an HTTP 404 is received,
only WalkUpScan can be used. If an HTTP 200 is received, only WalkUpScanToComp can be used. In this mode basically in
all URLs and XML contents the text 'WalkupScan' has to be replaced with 'WalkupScanToComp'.

Hint: In the original recording this function was called after 'GET /DevMgmt/DiscoveryTree.xml', but apparently it has
to be the first request to choose which request needs to be used next.

_Request_

```http
GET /WalkupScanToComp/WalkupScanToCompCaps HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response when only WalkupScan API is supported_

```http
HTTP/1.1 404 Not Found
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Length: 0
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
```

_Response when only WalkupScanToComp API is supported_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Deskjet 3520 series - CX052B; Serial Number: CN28F14C4105SY; Stuttgart_pp_usr_hf Built:Mon Dec 21, 2015 09:48:45AM {STP1FN1552AR, ASIC id 0x00340104}
Content-Type: text/xml
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
Content-Length: 676

<?xml version="1.0" encoding="UTF-8"?>
<!---->
<wus:WalkupScanToCompCaps xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/ledm/walkupscan/2010/09/28 WalkupScanToComp.xsd" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:wus="http://www.hp.com/schemas/imaging/con/ledm/walkupscan/2010/09/28" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<wus:MaxNetworkDestinations>15</wus:MaxNetworkDestinations>
	<wus:SupportsMultiItemScanFromPlaten>false</wus:SupportsMultiItemScanFromPlaten>
	<wus:UserActionTimeout>
		<dd:ValueFloat>60</dd:ValueFloat>
		<dd:Unit>seconds</dd:Unit>
	</wus:UserActionTimeout>
</wus:WalkupScanToCompCaps>
```

### `GET /WalkupScan/WalkupScanDestinations`

Lookup if a destination is registered on the printer for: `LAPTOP-BSHRTBV8` (it doesn't)

_Request_

```http
GET /WalkupScan/WalkupScanDestinations HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
Content-Length: 1122
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache

<?xml version="1.0" encoding="UTF-8"?>
<!--Sample XML file generated by XMLSpy v2007 sp1 (http://www.altova.com)-->
<wus:WalkupScanDestinations xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21 WalkupScanDestinations.xsd" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:dd3="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06" xmlns:scantype="http://www.hp.com/schemas/imaging/con/ledm/scantype/2008/03/17" xmlns:wus="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<dd:Version>
		<dd:Revision>1.0</dd:Revision>
		<dd:Date>2007-12-11</dd:Date>
	</dd:Version>
	<wus:MaxNetworkDestinations>15</wus:MaxNetworkDestinations>
	<wus:WalkupScanDestination>
		<dd:ResourceURI>http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1c8531b2-b81f-1f08-ba29-2c768ab21113</dd:ResourceURI>
		<dd:Name>DESKTOP-JI67N1P</dd:Name>
		<dd3:Hostname>DESKTOP-JI67N1P</dd3:Hostname>
		<wus:LinkType>Network</wus:LinkType>
	</wus:WalkupScanDestination>
</wus:WalkupScanDestinations>
```

In case the scanner uses the newer WalkupScanToComp API, the GET request has to go to the URL
/WalkupScanToComp/WalkupScanToCompDestinations and would return the following xml (in case there is no desination
registered yet):
_Response_

```http
<?xml version="1.0" encoding="UTF-8"?>
<!---->
<wus:WalkupScanToCompDestinations xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/ledm/walkupscan/2010/09/28 WalkupScanToComp.xsd" xmlns:wus="http://www.hp.com/schemas/imaging/con/ledm/walkupscan/2010/09/28" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:dd3="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
</wus:WalkupScanToCompDestinations>
```

### `POST /WalkupScan/WalkupScanDestinations`

Register a new `LAPTOP-BSHRTBV8` destination.

Notice the `Location` header correspond to it.

_Request_

```http
POST /WalkupScan/WalkupScanDestinations HTTP/1.1
Content-Length: 564
Content-Type: text/xml
HOST: 192.168.1.7:8080

<?xml version="1.0" encoding="UTF-8"?>
<WalkupScanDestination xmlns="http://www.hp.com/schemas/imaging/con/cnx/walkupscan/2009/09/21" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/cnx/walkupscan/2009/09/21 WalkupScanDestinations.xsd">
	<Hostname xmlns="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06">LAPTOP-BSHRTBV8</Hostname>
	<Name xmlns="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">LAPTOP-BSHRTBV8</Name>
	<LinkType>Network</LinkType>
</WalkupScanDestination>
```

_Response_

```http
HTTP/1.1 201 Created
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Location: http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
Content-Length: 0
```

In case the scanner uses the newer WalkupScanToComp API, the POST request has to go to the URL
/WalkupScanToComp/WalkupScanToCompDestinations with the following xml content. Note that it seems to be relevant to use
the newer namespaces/schema from 2010, otherwise you get an HTTP 400 error.

```http
<?xml version="1.0" encoding="UTF-8"?>
<WalkupScanToCompDestination xmlns="http://www.hp.com/schemas/imaging/con/ledm/walkupscan/2010/09/28" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/ledm/walkupscan/2010/09/28 WalkupScanToComp.xsd">
	<Hostname xmlns="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06">LAPTOP-BSHRTBV8</Hostname>
	<Name xmlns="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">LAPTOP-BSHRTBV8</Name>
	<LinkType>Network</LinkType>
</WalkupScanToCompDestination>
```

### `GET /EventMgmt/EventTable`

Query for event and collect the received `ETag`: `164-11`

_Request_

```http
GET /EventMgmt/EventTable HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
ETag: "164-11"
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
Content-Length: 1479

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<ev:EventTable xmlns:ev="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16"                                                                 xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/"                                                                      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"                                                                                   xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16 ../schemas/ledmEvents.xsd                                 http://www.hp.com/schemas/imaging/con/dictionaries/1.0/ ../schemas/dd/DataDictionaryMasterLEDM.xsd">
  <dd:Version>
    <dd:Revision>SVN.3295</dd:Revision>
  </dd:Version>
  <ev:Event>
    <dd:UnqualifiedEventCategory>DeviceCapabilitiesChanged</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>139-1</dd:AgingStamp>
  </ev:Event>
  <ev:Event>
    <dd:UnqualifiedEventCategory>PowerUpEvent</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>163-1</dd:AgingStamp>
  </ev:Event>
  <ev:Event>
    <dd:UnqualifiedEventCategory>AlertTableChanged</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>164-9</dd:AgingStamp>
  </ev:Event>
  <ev:Event>
    <dd:UnqualifiedEventCategory>JobEvent</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>164-11</dd:AgingStamp>
  </ev:Event>
</ev:EventTable>
```

### `GET /EventMgmt/EventTable?timeout=1200`

Poll for new events with a conditional get on the previously received `ETag` value.

The `timeout` parameter is an amount of time during which this query __MAY__ block.

In this response a new `ScanEvent` has been triggered. This event belongs to the destination
URI: `http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113` (which is the one
that has just been registered)

_Request_

```http
GET /EventMgmt/EventTable?timeout=1200 HTTP/1.1
HOST: 192.168.1.7:8080
If-None-Match: "164-11"
```

_Response_

```httpHTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
ETag: "164-12"
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
Content-Length: 1263

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<ev:EventTable xmlns:ev="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16"                                                                 xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/"                                                                      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"                                                                                   xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16 ../schemas/ledmEvents.xsd                                 http://www.hp.com/schemas/imaging/con/dictionaries/1.0/ ../schemas/dd/DataDictionaryMasterLEDM.xsd">
  <dd:Version>
    <dd:Revision>SVN.3295</dd:Revision>
  </dd:Version>
  <ev:Event>
    <dd:UnqualifiedEventCategory>ScanEvent</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>164-12</dd:AgingStamp>
    <ev:Payload>
      <dd:ResourceURI>http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113</dd:ResourceURI>
      <dd:ResourceType>hpCnxWalkupScanDestinations</dd:ResourceType>
    </ev:Payload>
  </ev:Event>
</ev:EventTable>
```

### `GET /WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113`

This query is made to fetch the option selected ton the panel. In this case it's `SaveJPEG` but it could also
be `SaveJPEG`.

_Request_

```http
GET /WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113 HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
Content-Length: 1165
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache

<?xml version="1.0" encoding="UTF-8"?>
<!--Sample XML file generated by XMLSpy v2007 sp1 (http://www.altova.com)-->
<wus:WalkupScanDestinations xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21 WalkupScanDestinations.xsd" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:dd3="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06" xmlns:scantype="http://www.hp.com/schemas/imaging/con/ledm/scantype/2008/03/17" xmlns:wus="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<wus:WalkupScanDestination>
		<dd:ResourceURI>http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113</dd:ResourceURI>
		<dd:Name>LAPTOP-BSHRTBV8</dd:Name>
		<dd3:Hostname>LAPTOP-BSHRTBV8</dd3:Hostname>
		<wus:LinkType>Network</wus:LinkType>
		<wus:WalkupScanSettings>
			<scantype:ScanSettings>
				<dd:ScanPlexMode>Simplex</dd:ScanPlexMode>
			</scantype:ScanSettings>
			<wus:Shortcut>SavePDF</wus:Shortcut>
		</wus:WalkupScanSettings>
	</wus:WalkupScanDestination>
</wus:WalkupScanDestinations>
```

In case the scanner uses the newer WalkupScanToComp API, the GET request has to go to the URL
/WalkupScanToComp/WalkupScanToCompDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113 and would return the following xml:
_Response_

```http
<?xml version="1.0" encoding="UTF-8"?>
<!---->
<wus:WalkupScanToCompDestination xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/ledm/walkupscan/2010/09/28 WalkupScanToComp.xsd" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:dd3="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06" xmlns:scantype="http://www.hp.com/schemas/imaging/con/ledm/scantype/2008/03/17" xmlns:wus="http://www.hp.com/schemas/imaging/con/ledm/walkupscan/2010/09/28" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<dd:ResourceURI>/WalkupScanToComp/WalkupScanToCompDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113</dd:ResourceURI>
	<dd:Name>LAPTOP-BSHRTBV8</dd:Name>
	<dd3:Hostname>LAPTOP-BSHRTBV8</dd3:Hostname>
	<wus:LinkType>Network</wus:LinkType>
	<wus:WalkupScanToCompSettings>
		<scantype:ScanSettings>
			<dd:ScanPlexMode>Simplex</dd:ScanPlexMode>
		</scantype:ScanSettings>
		<wus:Shortcut>SaveDocument1</wus:Shortcut>
	</wus:WalkupScanToCompSettings>
</wus:WalkupScanToCompDestination>
```

### `GET /DevMgmt/DiscoveryTree.xml`

Get a ?`DiscoveryTree`?

_Request_

```http
GET /DevMgmt/DiscoveryTree.xml HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
Content-Length: 12981
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<ledm:DiscoveryTree xmlns:ledm="http://www.hp.com/schemas/imaging/con/ledm/2007/09/21" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/">
	<dd:Version>
		<dd:Revision>SVN.2730</dd:Revision>
	</dd:Version>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/FaxPhoneBookDyn.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmFaxPhoneBookDyn</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/faxphonebookdyn/2008/03/17</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/FaxPhoneBookCap.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmFaxPhoneBookCap</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/faxphonebookcap/2008/03/17</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/FaxConfigDyn.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmFaxConfigDyn</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/faxconfigdyn/2009/03/03</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/FaxConfigCap.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmFaxConfigCap</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/faxconfigcap/2009/03/03</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/CallerIdList.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmCallerIdList</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/rest/calleridlist/2009/08/17</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/FaxBlockListDyn.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmFaxBlockListDyn</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/faxblklistdyn/2008/04/03</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/FaxBlockListCap.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmFaxBlockListCap</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/faxblklistcap/2008/04/03</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/FaxActivityLogCap.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmFaxActivityLogCap</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/FaxActivityLogCap/2007/09</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/FaxActivityLogDyn.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmFaxActivityLogDyn</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/FaxActivityLogDyn/2007/09</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/ProductConfigCap.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmProductConfigCap</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/ProductConfigCap/2009/03/16</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/ProductConfigDyn.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmProductConfigDyn</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/ProductConfigDyn/2009/03/16</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/NetAppsCap.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmNetAppsCap</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/netappcap/2009/06/24</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/NetAppsDyn.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmNetAppsDyn</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/netappdyn/2009/06/24</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/FaxUploadDyn.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmFaxUploadDyn</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/faxuploaddyn/2008/07/01</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/FaxUploadCap.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmFaxUploadCap</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/faxuploadcap/2008/08/12</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/ShopForSupplies.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmShopForSupplies</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/ljs/shopforsuppliesrequest/2007/11/07</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/ProductStatusCap.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmProductStatusCap</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/ProductStatusCap/2007/10/31</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/ProductStatusDyn.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmProductStatusDyn</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/ProductStatusDyn/2007/10/31</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/PrintConfigCap.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmPrintConfigCap</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/printconfigcap/2009/05/06</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/PrintConfigDyn.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmPrintConfigDyn</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/printconfigdyn/2009/05/06</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/ProductUsageCap.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmProductUsageCap</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/productusagecap/2007/12/11</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/ProductUsageDyn.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmProductUsageDyn</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/productusagedyn/2007/12/11</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/ConsumableConfigCap.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmConsumableConfigCap</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/ConsumableConfigCap/2007/11/19</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/ConsumableConfigDyn.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmConsumableConfigDyn</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/ConsumableConfigDyn/2007/11/19</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/MediaHandlingDyn.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmMediaHandlingDyn</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/mediahandlingdyn/2007/11/21</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/MediaHandlingCap.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmMediaHandlingCap</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/mediahandlingcap/2009/06/25</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/MediaCap.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmMediaCap</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/mediacap/2009/05/21</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/MediaDyn.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmMediaDyn</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/MediaDyn/2009/05/21</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/MassStorageConfigCap.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmMassStorageConfigCap</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/massstorageconfigcap/2008/01/25</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/MassStorageConfigDyn.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmMassStorageConfigDyn</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/massstorageconfigdyn/2008/01/25</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/SecurityDyn.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmSecurityDyn</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/securitydyn/2008/02/01</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/ProductLogsCap.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmProductLogsCap</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/productlogscap/2008/01/16</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedTree>
		<dd:ResourceURI>/DevMgmt/ProductLogsDyn.xml</dd:ResourceURI>
		<dd:ResourceType>ledm:hpLedmProductLogsDyn</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/productlogsdyn/2008/01/16</dd:Revision>
	</ledm:SupportedTree>
	<ledm:SupportedIfc>
		<ledm:ManifestURI>/Copy/CopyManifest.xml</ledm:ManifestURI>
		<dd:ResourceType>ledm:hpLedmCopyJobManifest</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24</dd:Revision>
	</ledm:SupportedIfc>
	<ledm:SupportedIfc>
		<ledm:ManifestURI>/WalkupScan/WalkupScanManifest.xml</ledm:ManifestURI>
		<dd:ResourceType>hpCnxWalkupScanManifest</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24</dd:Revision>
	</ledm:SupportedIfc>
	<ledm:SupportedIfc>
		<ledm:ManifestURI>/Scan/ScanJobManifest.xml</ledm:ManifestURI>
		<dd:ResourceType>ledm:hpLedmScanJobManifest</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24</dd:Revision>
	</ledm:SupportedIfc>
	<ledm:SupportedIfc>
		<ledm:ManifestURI>/Print/PrintManifest.xml</ledm:ManifestURI>
		<dd:ResourceType>hpCnxPrintManifest</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24</dd:Revision>
	</ledm:SupportedIfc>
	<ledm:SupportedIfc>
		<ledm:ManifestURI>/Calibration/CalibrationManifest.xml</ledm:ManifestURI>
		<dd:ResourceType>ledm:hpCnxCalibrationManifest</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24</dd:Revision>
	</ledm:SupportedIfc>
	<ledm:SupportedIfc>
		<ledm:ManifestURI>/BackupRestore/BackupRestoreManifest.xml</ledm:ManifestURI>
		<dd:ResourceType>ledm:hpLedmBackupRestore</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/backuprestore/2009/05/22</dd:Revision>
	</ledm:SupportedIfc>
	<ledm:SupportedIfc>
		<ledm:ManifestURI>/DevMgmt/FaxPCSendManifest.xml</ledm:ManifestURI>
		<dd:ResourceType>ledm:hpLedmFaxPCSendManifest</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24</dd:Revision>
	</ledm:SupportedIfc>
	<ledm:SupportedIfc>
		<ledm:ManifestURI>/DevMgmt/InternalPrintManifest.xml</ledm:ManifestURI>
		<dd:ResourceType>ledm:hpLedmInternalPrintManifest</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24</dd:Revision>
	</ledm:SupportedIfc>
	<ledm:SupportedIfc>
		<ledm:ManifestURI>/Jobs/JobsManifest.xml</ledm:ManifestURI>
		<dd:ResourceType>ledm:hpLedmJobsManifest</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24</dd:Revision>
	</ledm:SupportedIfc>
	<ledm:SupportedIfc>
		<ledm:ManifestURI>/ePrint/ePrintManifest.xml</ledm:ManifestURI>
		<dd:ResourceType>ledm:hpePrintManifest</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24</dd:Revision>
	</ledm:SupportedIfc>
	<ledm:SupportedIfc>
		<ledm:ManifestURI>/PrintApp/PrintAppManifest.xml</ledm:ManifestURI>
		<dd:ResourceType>hpCnxPrintAppManifest</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24</dd:Revision>
	</ledm:SupportedIfc>
	<ledm:SupportedIfc>
		<ledm:ManifestURI>/IoMgmt/IoMgmtManifest.xml</ledm:ManifestURI>
		<dd:ResourceType>ledm:hpLedmIoMgmt</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24</dd:Revision>
	</ledm:SupportedIfc>
	<ledm:SupportedIfc>
		<ledm:ManifestURI>/EventMgmt/EventMgmtManifest.xml</ledm:ManifestURI>
		<dd:ResourceType>ledm:hpLedmEventMgmtManifest</dd:ResourceType>
		<dd:Revision>http://www.hp.com/schemas/imaging/con/ledm/manifest/2009/03/24</dd:Revision>
	</ledm:SupportedIfc>
</ledm:DiscoveryTree>
```

### `GET /Scan/ScanCaps.xml`

Getting `ScanCaps.xml` (?Scanner capabilities?)

_Request_

```http
GET /Scan/ScanCaps.xml HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
Content-Length: 6458

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<ScanCaps xmlns="http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19">
	<DeviceCaps>
		<ModelName>e710n</ModelName>
		<DerivativeNumber>10</DerivativeNumber>
	</DeviceCaps>
	<ColorEntries>
		<ColorEntry>
			<ColorType>K1</ColorType>
			<Formats>
				<Format>Raw</Format>
			</Formats>
			<ImageTransforms>
				<ImageTransform>ToneMap</ImageTransform>
				<ImageTransform>Sharpening</ImageTransform>
				<ImageTransform>NoiseRemoval</ImageTransform>
			</ImageTransforms>
			<GrayRenderings>
				<GrayRendering>GrayCcdEmulated</GrayRendering>
			</GrayRenderings>
		</ColorEntry>
		<ColorEntry>
			<ColorType>Gray8</ColorType>
			<Formats>
				<Format>Raw</Format>
				<Format>Jpeg</Format>
			</Formats>
			<ImageTransforms>
				<ImageTransform>ToneMap</ImageTransform>
				<ImageTransform>Sharpening</ImageTransform>
				<ImageTransform>NoiseRemoval</ImageTransform>
			</ImageTransforms>
			<GrayRenderings>
				<GrayRendering>NTSC</GrayRendering>
				<GrayRendering>GrayCcdEmulated</GrayRendering>
			</GrayRenderings>
		</ColorEntry>
		<ColorEntry>
			<ColorType>Color8</ColorType>
			<Formats>
				<Format>Raw</Format>
				<Format>Jpeg</Format>
			</Formats>
			<ImageTransforms>
				<ImageTransform>ToneMap</ImageTransform>
				<ImageTransform>Sharpening</ImageTransform>
				<ImageTransform>NoiseRemoval</ImageTransform>
			</ImageTransforms>
		</ColorEntry>
	</ColorEntries>
	<Platen>
		<InputSourceCaps>
			<MinWidth>8</MinWidth>
			<MinHeight>8</MinHeight>
			<MaxWidth>2550</MaxWidth>
			<MaxHeight>3508</MaxHeight>
			<RiskyLeftMargin>21</RiskyLeftMargin>
			<RiskyRightMargin>30</RiskyRightMargin>
			<RiskyTopMargin>36</RiskyTopMargin>
			<RiskyBottomMargin>32</RiskyBottomMargin>
			<MinResolution>75</MinResolution>
			<MaxOpticalXResolution>4800</MaxOpticalXResolution>
			<MaxOpticalYResolution>4800</MaxOpticalYResolution>
			<SupportedResolutions>
				<Resolution>
					<XResolution>75</XResolution>
					<YResolution>75</YResolution>
					<NumCcd>1</NumCcd>
					<ColorTypes>
						<ColorType>K1</ColorType>
						<ColorType>Gray8</ColorType>
						<ColorType>Color8</ColorType>
					</ColorTypes>
				</Resolution>
				<Resolution>
					<XResolution>100</XResolution>
					<YResolution>100</YResolution>
					<NumCcd>1</NumCcd>
					<ColorTypes>
						<ColorType>K1</ColorType>
						<ColorType>Gray8</ColorType>
						<ColorType>Color8</ColorType>
					</ColorTypes>
				</Resolution>
				<Resolution>
					<XResolution>200</XResolution>
					<YResolution>200</YResolution>
					<NumCcd>1</NumCcd>
					<ColorTypes>
						<ColorType>K1</ColorType>
						<ColorType>Gray8</ColorType>
						<ColorType>Color8</ColorType>
					</ColorTypes>
				</Resolution>
				<Resolution>
					<XResolution>300</XResolution>
					<YResolution>300</YResolution>
					<NumCcd>1</NumCcd>
					<ColorTypes>
						<ColorType>K1</ColorType>
						<ColorType>Gray8</ColorType>
						<ColorType>Color8</ColorType>
					</ColorTypes>
				</Resolution>
				<Resolution>
					<XResolution>600</XResolution>
					<YResolution>600</YResolution>
					<NumCcd>1</NumCcd>
					<ColorTypes>
						<ColorType>K1</ColorType>
						<ColorType>Gray8</ColorType>
						<ColorType>Color8</ColorType>
					</ColorTypes>
				</Resolution>
				<Resolution>
					<XResolution>1200</XResolution>
					<YResolution>1200</YResolution>
					<NumCcd>1</NumCcd>
					<ColorTypes>
						<ColorType>K1</ColorType>
						<ColorType>Gray8</ColorType>
						<ColorType>Color8</ColorType>
					</ColorTypes>
				</Resolution>
				<Resolution>
					<XResolution>2400</XResolution>
					<YResolution>2400</YResolution>
					<NumCcd>1</NumCcd>
					<ColorTypes>
						<ColorType>K1</ColorType>
						<ColorType>Gray8</ColorType>
						<ColorType>Color8</ColorType>
					</ColorTypes>
				</Resolution>
				<Resolution>
					<XResolution>4800</XResolution>
					<YResolution>4800</YResolution>
					<NumCcd>1</NumCcd>
					<ColorTypes>
						<ColorType>K1</ColorType>
						<ColorType>Gray8</ColorType>
						<ColorType>Color8</ColorType>
					</ColorTypes>
				</Resolution>
			</SupportedResolutions>
		</InputSourceCaps>
	</Platen>
	<Adf>
		<InputSourceCaps>
			<MinWidth>8</MinWidth>
			<MinHeight>8</MinHeight>
			<MaxWidth>2550</MaxWidth>
			<MaxHeight>4200</MaxHeight>
			<RiskyLeftMargin>16</RiskyLeftMargin>
			<RiskyRightMargin>0</RiskyRightMargin>
			<RiskyTopMargin>35</RiskyTopMargin>
			<RiskyBottomMargin>35</RiskyBottomMargin>
			<MinResolution>75</MinResolution>
			<MaxOpticalXResolution>600</MaxOpticalXResolution>
			<MaxOpticalYResolution>600</MaxOpticalYResolution>
			<SupportedResolutions>
				<Resolution>
					<XResolution>75</XResolution>
					<YResolution>75</YResolution>
					<NumCcd>1</NumCcd>
					<ColorTypes>
						<ColorType>K1</ColorType>
						<ColorType>Gray8</ColorType>
						<ColorType>Color8</ColorType>
					</ColorTypes>
				</Resolution>
				<Resolution>
					<XResolution>100</XResolution>
					<YResolution>100</YResolution>
					<NumCcd>1</NumCcd>
					<ColorTypes>
						<ColorType>K1</ColorType>
						<ColorType>Gray8</ColorType>
						<ColorType>Color8</ColorType>
					</ColorTypes>
				</Resolution>
				<Resolution>
					<XResolution>200</XResolution>
					<YResolution>200</YResolution>
					<NumCcd>1</NumCcd>
					<ColorTypes>
						<ColorType>K1</ColorType>
						<ColorType>Gray8</ColorType>
						<ColorType>Color8</ColorType>
					</ColorTypes>
				</Resolution>
				<Resolution>
					<XResolution>300</XResolution>
					<YResolution>300</YResolution>
					<NumCcd>1</NumCcd>
					<ColorTypes>
						<ColorType>K1</ColorType>
						<ColorType>Gray8</ColorType>
						<ColorType>Color8</ColorType>
					</ColorTypes>
				</Resolution>
				<Resolution>
					<XResolution>600</XResolution>
					<YResolution>600</YResolution>
					<NumCcd>1</NumCcd>
					<ColorTypes>
						<ColorType>K1</ColorType>
						<ColorType>Gray8</ColorType>
						<ColorType>Color8</ColorType>
					</ColorTypes>
				</Resolution>
			</SupportedResolutions>
		</InputSourceCaps>
		<FeederCapacity>35</FeederCapacity>
		<AdfOptions>
			<AdfOption>DetectPaperLoaded</AdfOption>
		</AdfOptions>
	</Adf>
</ScanCaps>
```

### `GET /Scan/Status`

Getting the scanner status: `Idle` and Afd `Loaded` (It could be `Empty`). Note that the tag AdfState is missing when
the scanner has no automatic document feeder.

_Request_

```http
GET /Scan/Status HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
Content-Length: 283

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<ScanStatus xmlns="http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19">
	<ScannerState>Idle</ScannerState>
	<AdfState>Loaded</AdfState>
</ScanStatus>
```

### `GET /WalkupScan/WalkupScanDestinations`

Query one more time the `/WalkupScan/WalkupScanDestinations`. Why ?

_Request_

```http
GET /WalkupScan/WalkupScanDestinations HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
Content-Length: 1440
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache

<?xml version="1.0" encoding="UTF-8"?>
<!--Sample XML file generated by XMLSpy v2007 sp1 (http://www.altova.com)-->
<wus:WalkupScanDestinations xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21 WalkupScanDestinations.xsd" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:dd3="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06" xmlns:scantype="http://www.hp.com/schemas/imaging/con/ledm/scantype/2008/03/17" xmlns:wus="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<dd:Version>
		<dd:Revision>1.0</dd:Revision>
		<dd:Date>2007-12-11</dd:Date>
	</dd:Version>
	<wus:MaxNetworkDestinations>15</wus:MaxNetworkDestinations>
	<wus:WalkupScanDestination>
		<dd:ResourceURI>http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1c8531b2-b81f-1f08-ba29-2c768ab21113</dd:ResourceURI>
		<dd:Name>DESKTOP-JI67N1P</dd:Name>
		<dd3:Hostname>DESKTOP-JI67N1P</dd3:Hostname>
		<wus:LinkType>Network</wus:LinkType>
	</wus:WalkupScanDestination>
	<wus:WalkupScanDestination>
		<dd:ResourceURI>http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113</dd:ResourceURI>
		<dd:Name>LAPTOP-BSHRTBV8</dd:Name>
		<dd3:Hostname>LAPTOP-BSHRTBV8</dd3:Hostname>
		<wus:LinkType>Network</wus:LinkType>
	</wus:WalkupScanDestination>
</wus:WalkupScanDestinations>
```

### `GET  http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113`

Query `/WalkupScan/WalkupScanDestinations/WalkupScanDestination/{id}`. Why? (the response is the same)

_Request_

```http
GET http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113 HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
Content-Length: 1165
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache

<?xml version="1.0" encoding="UTF-8"?>
<!--Sample XML file generated by XMLSpy v2007 sp1 (http://www.altova.com)-->
<wus:WalkupScanDestinations xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21 WalkupScanDestinations.xsd" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:dd3="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06" xmlns:scantype="http://www.hp.com/schemas/imaging/con/ledm/scantype/2008/03/17" xmlns:wus="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<wus:WalkupScanDestination>
		<dd:ResourceURI>http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113</dd:ResourceURI>
		<dd:Name>LAPTOP-BSHRTBV8</dd:Name>
		<dd3:Hostname>LAPTOP-BSHRTBV8</dd3:Hostname>
		<wus:LinkType>Network</wus:LinkType>
		<wus:WalkupScanSettings>
			<scantype:ScanSettings>
				<dd:ScanPlexMode>Simplex</dd:ScanPlexMode>
			</scantype:ScanSettings>
			<wus:Shortcut>SavePDF</wus:Shortcut>
		</wus:WalkupScanSettings>
	</wus:WalkupScanDestination>
</wus:WalkupScanDestinations>
```

### `GET /WalkupScan/WalkupScanDestinations`

Query one more time the `/WalkupScan/WalkupScanDestinations`. Why ?

_Request_

```http
GET /WalkupScan/WalkupScanDestinations HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
Content-Length: 1440
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache

<?xml version="1.0" encoding="UTF-8"?>
<!--Sample XML file generated by XMLSpy v2007 sp1 (http://www.altova.com)-->
<wus:WalkupScanDestinations xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21 WalkupScanDestinations.xsd" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:dd3="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06" xmlns:scantype="http://www.hp.com/schemas/imaging/con/ledm/scantype/2008/03/17" xmlns:wus="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<dd:Version>
		<dd:Revision>1.0</dd:Revision>
		<dd:Date>2007-12-11</dd:Date>
	</dd:Version>
	<wus:MaxNetworkDestinations>15</wus:MaxNetworkDestinations>
	<wus:WalkupScanDestination>
		<dd:ResourceURI>http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1c8531b2-b81f-1f08-ba29-2c768ab21113</dd:ResourceURI>
		<dd:Name>DESKTOP-JI67N1P</dd:Name>
		<dd3:Hostname>DESKTOP-JI67N1P</dd3:Hostname>
		<wus:LinkType>Network</wus:LinkType>
	</wus:WalkupScanDestination>
	<wus:WalkupScanDestination>
		<dd:ResourceURI>http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113</dd:ResourceURI>
		<dd:Name>LAPTOP-BSHRTBV8</dd:Name>
		<dd3:Hostname>LAPTOP-BSHRTBV8</dd3:Hostname>
		<wus:LinkType>Network</wus:LinkType>
	</wus:WalkupScanDestination>
</wus:WalkupScanDestinations>
```

### `GET /EventMgmt/EventTable`

Query one more time the `/EventMgmt/EventTable`. Why ?

_Request_

```http
GET /EventMgmt/EventTable HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
ETag: "164-12"
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
Content-Length: 1866

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<ev:EventTable xmlns:ev="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16"                                                                 xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/"                                                                      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"                                                                                   xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16 ../schemas/ledmEvents.xsd                                 http://www.hp.com/schemas/imaging/con/dictionaries/1.0/ ../schemas/dd/DataDictionaryMasterLEDM.xsd">
  <dd:Version>
    <dd:Revision>SVN.3295</dd:Revision>
  </dd:Version>
  <ev:Event>
    <dd:UnqualifiedEventCategory>DeviceCapabilitiesChanged</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>139-1</dd:AgingStamp>
  </ev:Event>
  <ev:Event>
    <dd:UnqualifiedEventCategory>PowerUpEvent</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>163-1</dd:AgingStamp>
  </ev:Event>
  <ev:Event>
    <dd:UnqualifiedEventCategory>AlertTableChanged</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>164-9</dd:AgingStamp>
  </ev:Event>
  <ev:Event>
    <dd:UnqualifiedEventCategory>JobEvent</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>164-11</dd:AgingStamp>
  </ev:Event>
  <ev:Event>
    <dd:UnqualifiedEventCategory>ScanEvent</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>164-12</dd:AgingStamp>
    <ev:Payload>
      <dd:ResourceURI>http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113</dd:ResourceURI>
      <dd:ResourceType>hpCnxWalkupScanDestinations</dd:ResourceType>
    </ev:Payload>
  </ev:Event>
</ev:EventTable>
```

### `GET /Scan/Status`

_Request_

```http
GET /Scan/Status HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
Content-Length: 283

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<ScanStatus xmlns="http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19">
	<ScannerState>Idle</ScannerState>
	<AdfState>Loaded</AdfState>
</ScanStatus>
```

### `GET /WalkupScan/WalkupScanDestinations`

Query one more time the `/WalkupScan/WalkupScanDestinations`. Why ?

_Request_

```http
GET /WalkupScan/WalkupScanDestinations HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
Content-Length: 1440
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache

<?xml version="1.0" encoding="UTF-8"?>
<!--Sample XML file generated by XMLSpy v2007 sp1 (http://www.altova.com)-->
<wus:WalkupScanDestinations xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21 WalkupScanDestinations.xsd" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:dd3="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06" xmlns:scantype="http://www.hp.com/schemas/imaging/con/ledm/scantype/2008/03/17" xmlns:wus="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<dd:Version>
		<dd:Revision>1.0</dd:Revision>
		<dd:Date>2007-12-11</dd:Date>
	</dd:Version>
	<wus:MaxNetworkDestinations>15</wus:MaxNetworkDestinations>
	<wus:WalkupScanDestination>
		<dd:ResourceURI>http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1c8531b2-b81f-1f08-ba29-2c768ab21113</dd:ResourceURI>
		<dd:Name>DESKTOP-JI67N1P</dd:Name>
		<dd3:Hostname>DESKTOP-JI67N1P</dd3:Hostname>
		<wus:LinkType>Network</wus:LinkType>
	</wus:WalkupScanDestination>
	<wus:WalkupScanDestination>
		<dd:ResourceURI>http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113</dd:ResourceURI>
		<dd:Name>LAPTOP-BSHRTBV8</dd:Name>
		<dd3:Hostname>LAPTOP-BSHRTBV8</dd3:Hostname>
		<wus:LinkType>Network</wus:LinkType>
	</wus:WalkupScanDestination>
</wus:WalkupScanDestinations>
```

### `GET http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113`

Query `/WalkupScan/WalkupScanDestinations/WalkupScanDestination/{id}`. Why? (the response is the same)

_Request_

```http
GET http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113 HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
Content-Length: 1165
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache

<?xml version="1.0" encoding="UTF-8"?>
<!--Sample XML file generated by XMLSpy v2007 sp1 (http://www.altova.com)-->
<wus:WalkupScanDestinations xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21 WalkupScanDestinations.xsd" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:dd3="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06" xmlns:scantype="http://www.hp.com/schemas/imaging/con/ledm/scantype/2008/03/17" xmlns:wus="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<wus:WalkupScanDestination>
		<dd:ResourceURI>http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113</dd:ResourceURI>
		<dd:Name>LAPTOP-BSHRTBV8</dd:Name>
		<dd3:Hostname>LAPTOP-BSHRTBV8</dd3:Hostname>
		<wus:LinkType>Network</wus:LinkType>
		<wus:WalkupScanSettings>
			<scantype:ScanSettings>
				<dd:ScanPlexMode>Simplex</dd:ScanPlexMode>
			</scantype:ScanSettings>
			<wus:Shortcut>SavePDF</wus:Shortcut>
		</wus:WalkupScanSettings>
	</wus:WalkupScanDestination>
</wus:WalkupScanDestinations>
```

### `GET /WalkupScan/WalkupScanDestinations`

Query one more time the `/WalkupScan/WalkupScanDestinations`. Why ?

_Request_

```http
GET /WalkupScan/WalkupScanDestinations HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
Content-Length: 1440
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache

<?xml version="1.0" encoding="UTF-8"?>
<!--Sample XML file generated by XMLSpy v2007 sp1 (http://www.altova.com)-->
<wus:WalkupScanDestinations xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21 WalkupScanDestinations.xsd" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:dd3="http://www.hp.com/schemas/imaging/con/dictionaries/2009/04/06" xmlns:scantype="http://www.hp.com/schemas/imaging/con/ledm/scantype/2008/03/17" xmlns:wus="http://www.hp.com/schemas/imaging/con/rest/walkupscan/2009/09/21" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
	<dd:Version>
		<dd:Revision>1.0</dd:Revision>
		<dd:Date>2007-12-11</dd:Date>
	</dd:Version>
	<wus:MaxNetworkDestinations>15</wus:MaxNetworkDestinations>
	<wus:WalkupScanDestination>
		<dd:ResourceURI>http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1c8531b2-b81f-1f08-ba29-2c768ab21113</dd:ResourceURI>
		<dd:Name>DESKTOP-JI67N1P</dd:Name>
		<dd3:Hostname>DESKTOP-JI67N1P</dd3:Hostname>
		<wus:LinkType>Network</wus:LinkType>
	</wus:WalkupScanDestination>
	<wus:WalkupScanDestination>
		<dd:ResourceURI>http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113</dd:ResourceURI>
		<dd:Name>LAPTOP-BSHRTBV8</dd:Name>
		<dd3:Hostname>LAPTOP-BSHRTBV8</dd3:Hostname>
		<wus:LinkType>Network</wus:LinkType>
	</wus:WalkupScanDestination>
</wus:WalkupScanDestinations>
```

### `GET /EventMgmt/EventTable`

Query one more time the `/EventMgmt/EventTable`. Why ?

_Request_

```http
GET /EventMgmt/EventTable HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
ETag: "164-12"
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
Content-Length: 1866

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<ev:EventTable xmlns:ev="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16"                                                                 xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/"                                                                      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"                                                                                   xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16 ../schemas/ledmEvents.xsd                                 http://www.hp.com/schemas/imaging/con/dictionaries/1.0/ ../schemas/dd/DataDictionaryMasterLEDM.xsd">
  <dd:Version>
    <dd:Revision>SVN.3295</dd:Revision>
  </dd:Version>
  <ev:Event>
    <dd:UnqualifiedEventCategory>DeviceCapabilitiesChanged</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>139-1</dd:AgingStamp>
  </ev:Event>
  <ev:Event>
    <dd:UnqualifiedEventCategory>PowerUpEvent</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>163-1</dd:AgingStamp>
  </ev:Event>
  <ev:Event>
    <dd:UnqualifiedEventCategory>AlertTableChanged</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>164-9</dd:AgingStamp>
  </ev:Event>
  <ev:Event>
    <dd:UnqualifiedEventCategory>JobEvent</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>164-11</dd:AgingStamp>
  </ev:Event>
  <ev:Event>
    <dd:UnqualifiedEventCategory>ScanEvent</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>164-12</dd:AgingStamp>
    <ev:Payload>
      <dd:ResourceURI>http://192.168.1.7:8080/WalkupScan/WalkupScanDestinations/1cb3125d-7bde-1f09-8da2-2c768ab21113</dd:ResourceURI>
      <dd:ResourceType>hpCnxWalkupScanDestinations</dd:ResourceType>
    </ev:Payload>
  </ev:Event>
</ev:EventTable>
```

### `GET /Scan/Status (4 times)`

_Request_

```http
GET /Scan/Status HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
Content-Length: 283

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<ScanStatus xmlns="http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19">
	<ScannerState>Idle</ScannerState>
	<AdfState>Loaded</AdfState>
</ScanStatus>
```

### `POST /Scan/Jobs`

Post a scan job.The `Location` header point to the newly created job.

The `Afd` was `Loaded` so the `InputSource` is `Afd`. If `AdfState` was empty, the `InputSource` would be `Platen`.

THe `Shortcut` `SavePDF` generated a `ContentType` to `Document` if it was `SaveJPEG` then it would be `Photo`.

_Request_

```http
POST /Scan/Jobs HTTP/1.1
Content-Length: 949
Content-Type: text/xml
HOST: 192.168.1.7:8080

<?xml version="1.0" encoding="UTF-8"?>
<ScanSettings xmlns="http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19 Scan Schema - 0.26.xsd">
	<XResolution>200</XResolution>
	<YResolution>200</YResolution>
	<XStart>33</XStart>
	<YStart>0</YStart>
	<Width>2481</Width>
	<Height>3507</Height>
	<Format>Jpeg</Format>
	<CompressionQFactor>0</CompressionQFactor>
	<ColorSpace>Color</ColorSpace>
	<BitDepth>8</BitDepth>
	<InputSource>Adf</InputSource>
	<GrayRendering>NTSC</GrayRendering>
	<ToneMap>
		<Gamma>1000</Gamma>
		<Brightness>1000</Brightness>
		<Contrast>1000</Contrast>
		<Highlite>179</Highlite>
		<Shadow>25</Shadow>
		<Threshold>0</Threshold>
	</ToneMap>
	<SharpeningLevel>128</SharpeningLevel>
	<NoiseRemoval>0</NoiseRemoval>
	<ContentType>Document</ContentType>
</ScanSettings>
```

_Response_

```http
HTTP/1.1 201 Created
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Location: http://192.168.1.7:8080/Jobs/JobList/2
Content-Length: 0
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
```

### `GET /Jobs/JobList/2 (55 times)`

Get the created job. The `BinaryURL` will helps to fetch the scanned document.

_Request_

```http
GET /Jobs/JobList/2 HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
ETag: "164-3"
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
Content-Length: 1620

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/jobs/2009/04/30" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:fax="http://www.hp.com/schemas/imaging/con/fax/2008/06/13" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/ledm/jobs/2009/04/30 ../schemas/Jobs.xsd">
	<j:JobUrl>/Jobs/JobList/2</j:JobUrl>
	<j:JobCategory>Scan</j:JobCategory>
	<j:JobState>Processing</j:JobState>
	<j:JobStateUpdate>164-3</j:JobStateUpdate>
	<ScanJob xmlns="http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19">
   <PreScanPage>
     <PageNumber>1</PageNumber>
     <PageState>PreparingScan</PageState>
     <BufferInfo>
       <ScanSettings>
         <XResolution>200</XResolution>
         <YResolution>200</YResolution>
         <XStart>33</XStart>
         <YStart>0</YStart>
         <Width>2481</Width>
         <Height>3507</Height>
         <Format>Jpeg</Format>
         <CompressionQFactor>0</CompressionQFactor>
         <ColorSpace>Color</ColorSpace>
         <BitDepth>8</BitDepth>
         <InputSource>Adf</InputSource>
         <ContentType>Document</ContentType>
       </ScanSettings>
       <ImageWidth>1654</ImageWidth>
       <ImageHeight>2338</ImageHeight>
       <BytesPerLine>4962</BytesPerLine>
       <Cooked>enabled</Cooked>
     </BufferInfo>
     <BinaryURL>/Scan/Jobs/2/Pages/1</BinaryURL>
     <ImageOrientation>Normal</ImageOrientation>
   </PreScanPage>
</ScanJob>
</j:Job>
```

....

The last time:
`PageState` pass from  `PreparingScan` to `ReadyToUpload`

_Request_

```http
GET /Jobs/JobList/2 HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
ETag: "164-3"
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
Content-Length: 1620

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/jobs/2009/04/30" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:fax="http://www.hp.com/schemas/imaging/con/fax/2008/06/13" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/ledm/jobs/2009/04/30 ../schemas/Jobs.xsd">
	<j:JobUrl>/Jobs/JobList/2</j:JobUrl>
	<j:JobCategory>Scan</j:JobCategory>
	<j:JobState>Processing</j:JobState>
	<j:JobStateUpdate>164-3</j:JobStateUpdate>
	<ScanJob xmlns="http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19">
   <PreScanPage>
     <PageNumber>1</PageNumber>
     <PageState>ReadyToUpload</PageState>
     <BufferInfo>
       <ScanSettings>
         <XResolution>200</XResolution>
         <YResolution>200</YResolution>
         <XStart>33</XStart>
         <YStart>0</YStart>
         <Width>2481</Width>
         <Height>3507</Height>
         <Format>Jpeg</Format>
         <CompressionQFactor>0</CompressionQFactor>
         <ColorSpace>Color</ColorSpace>
         <BitDepth>8</BitDepth>
         <InputSource>Adf</InputSource>
         <ContentType>Document</ContentType>
       </ScanSettings>
       <ImageWidth>1654</ImageWidth>
       <ImageHeight>2338</ImageHeight>
       <BytesPerLine>4962</BytesPerLine>
       <Cooked>enabled</Cooked>
     </BufferInfo>
     <BinaryURL>/Scan/Jobs/2/Pages/1</BinaryURL>
     <ImageOrientation>Normal</ImageOrientation>
   </PreScanPage>
</ScanJob>
</j:Job>
```

### `GET /Scan/Jobs/2/Pages/1`

Fetch the `BinaryURL`

_Request_

```http
GET /Scan/Jobs/2/Pages/1 HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: image/jpeg
Cache-Control: max-age=180
Transfer-Encoding: chunked

......JFIF.............C................	.........	
.


....................................C.......
..
..............................................................v..".....................................	
.................}........!1A..Qa."q.2....#B...R..$3br.	
.....%&'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz <content trunked>
```

### `GET /Jobs/JobList/2 (2 times)`

Re-query the job. A single sheet was in the tray so there is nothing more to proceed.

- `JobState`: `Completed`
- `PageState`: `UploadCompleted`
- `PageNumber`: `1`

_Request_

```http
GET /Jobs/JobList/2 HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```httpHTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
ETag: "164-4"
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
Content-Length: 892

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/jobs/2009/04/30" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:fax="http://www.hp.com/schemas/imaging/con/fax/2008/06/13" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/ledm/jobs/2009/04/30 ../schemas/Jobs.xsd">
	<j:JobUrl>/Jobs/JobList/2</j:JobUrl>
	<j:JobCategory>Scan</j:JobCategory>
	<j:JobState>Completed</j:JobState>
	<j:JobStateUpdate>164-4</j:JobStateUpdate>
	<ScanJob xmlns="http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19">
   <PostScanPage>
     <PageNumber>1</PageNumber>
     <PageState>UploadCompleted</PageState>
     <TotalLines>2294</TotalLines>
   </PostScanPage>
</ScanJob>
</j:Job>
```

Another time with the same data, I don't know why.
_Request_

```http
GET /Jobs/JobList/2 HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
ETag: "164-4"
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
Content-Length: 892

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<j:Job xmlns:j="http://www.hp.com/schemas/imaging/con/ledm/jobs/2009/04/30" xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/" xmlns:fax="http://www.hp.com/schemas/imaging/con/fax/2008/06/13" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/ledm/jobs/2009/04/30 ../schemas/Jobs.xsd">
	<j:JobUrl>/Jobs/JobList/2</j:JobUrl>
	<j:JobCategory>Scan</j:JobCategory>
	<j:JobState>Completed</j:JobState>
	<j:JobStateUpdate>164-4</j:JobStateUpdate>
	<ScanJob xmlns="http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19">
   <PostScanPage>
     <PageNumber>1</PageNumber>
     <PageState>UploadCompleted</PageState>
     <TotalLines>2294</TotalLines>
   </PostScanPage>
</ScanJob>
</j:Job>
```

### `GET /Scan/Status`

Get the scan status. It's back to `Idle` and the `AdfState` is `Empty`.

_Request_

```http
GET /Scan/Status HTTP/1.1
HOST: 192.168.1.7:8080
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
Content-Length: 282

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<ScanStatus xmlns="http://www.hp.com/schemas/imaging/con/cnx/scan/2008/08/19">
	<ScannerState>Idle</ScannerState>
	<AdfState>Empty</AdfState>
</ScanStatus>
```

### `GET /EventMgmt/EventTable?timeout=1200`

THe job is finished so, the `EventTable` is polled again.

_Request_

```http
GET /EventMgmt/EventTable?timeout=1200 HTTP/1.1
HOST: 192.168.1.7:8080
If-None-Match: "164-12"
```

_Response_

```http
HTTP/1.1 200 OK
Server: HP HTTP Server; HP Officejet 6500 E710n-z - CN557A; Serial Number: CN19K340MP05JW; Chianti_pp_usr_hf Built:Mon May 16, 2016 12:22:43PM {CIP1FN1621AR, ASIC id 0x001c2105}
Content-Type: text/xml
ETag: "164-14"
Cache-Control: must-revalidate, max-age=0
Pragma: no-cache
Content-Length: 1020

<?xml version="1.0" encoding="UTF-8"?>
<!-- THIS DATA SUBJECT TO DISCLAIMER(S) INCLUDED WITH THE PRODUCT OF ORIGIN. -->
<ev:EventTable xmlns:ev="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16"                                                                 xmlns:dd="http://www.hp.com/schemas/imaging/con/dictionaries/1.0/"                                                                      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"                                                                                   xsi:schemaLocation="http://www.hp.com/schemas/imaging/con/ledm/events/2007/09/16 ../schemas/ledmEvents.xsd                                 http://www.hp.com/schemas/imaging/con/dictionaries/1.0/ ../schemas/dd/DataDictionaryMasterLEDM.xsd">
  <dd:Version>
    <dd:Revision>SVN.3295</dd:Revision>
  </dd:Version>
  <ev:Event>
    <dd:UnqualifiedEventCategory>JobEvent</dd:UnqualifiedEventCategory>
    <dd:AgingStamp>164-14</dd:AgingStamp>
  </ev:Event>
</ev:EventTable>
```

### `GET /EventMgmt/EventTable?timeout=1192`

Polling continues... The timeout has decreased to `1192` (why?)

_Request_

```http
GET /EventMgmt/EventTable?timeout=1192 HTTP/1.1
HOST: 192.168.1.7:8080
If-None-Match: "164-14"
```

_Response_

```http
```

# See Also

- https://github.com/simulot/hpdevices
- https://github.com/havardgulldahl/hpscantools
- https://github.com/0x27/mrw-code/tree/master/opt/hp-scanner-monitor
- https://github.com/xpn/HP-3070a-Scan-Downloader
- https://github.com/DarovskikhAndrei/hpscan2linux

- https://github.com/arminha/covet
- https://github.com/xcsrz/hp-scan
- https://github.com/heisice/node-hpscan