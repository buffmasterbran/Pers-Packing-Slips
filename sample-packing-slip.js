<?xml version="1.0"?>
<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
<pdf>
<head>
    <!-- Fonts -->
    <#assign lato_regular = "https://tstdrv1850098.app.netsuite.com/core/media/media.nl?id=63459&c=TSTDRV1850098&h=kO3buwBkQyLHhErOKulf1Ap6994N-z9I8lNXNLzwkH-n0ALi&_xt=.ttf" />
    <#assign lato_bold = "https://tstdrv1850098.app.netsuite.com/core/media/media.nl?id=63462&c=TSTDRV1850098&h=fGr3KHlaxV6TffeoIX2LH8tJVkoUU_--Sn2cGGrfvcG8hfoq&_xt=.ttf" />
    <link type="font" name="Lato" subtype="TrueType" src-bold="${lato_bold?html}" src-normal="${lato_regular?html}" />
    <link name="NotoSans" type="font" subtype="truetype"
          src="${nsfont.NotoSans_Regular}" src-bold="${nsfont.NotoSans_Bold}"
          src-italic="${nsfont.NotoSans_Italic}" src-bolditalic="${nsfont.NotoSans_BoldItalic}" />

    <!-- Localization -->
    <#if .locale == "zh_CN">
        <link name="NotoSansCJKsc" type="font" subtype="opentype"
              src="${nsfont.NotoSansCJKsc_Regular}" src-bold="${nsfont.NotoSansCJKsc_Bold}" bytes="2" />
    <#elseif .locale == "zh_TW">
        <link name="NotoSansCJKtc" type="font" subtype="opentype"
              src="${nsfont.NotoSansCJKtc_Regular}" src-bold="${nsfont.NotoSansCJKtc_Bold}" bytes="2" />
    <#elseif .locale == "ja_JP">
        <link name="NotoSansCJKjp" type="font" subtype="opentype"
              src="${nsfont.NotoSansCJKjp_Regular}" src-bold="${nsfont.NotoSansCJKjp_Bold}" bytes="2" />
    <#elseif .locale == "ko_KR">
        <link name="NotoSansCJKkr" type="font" subtype="opentype"
              src="${nsfont.NotoSansCJKkr_Regular}" src-bold="${nsfont.NotoSansCJKkr_Bold}" bytes="2" />
    <#elseif .locale == "th_TH">
        <link name="NotoSansThai" type="font" subtype="opentype"
              src="${nsfont.NotoSansThai_Regular}" src-bold="${nsfont.NotoSansThai_Bold}" bytes="2" />
    </#if>

    <!-- Header -->
    <macrolist>
        <macro id="nlheader">
            <table class="header" style="width:100%;">
                <tr>
                    <!-- Left Section: Logo + Ship To -->
                    <td colspan="3" rowspan="5">
                        <table style="width:100%;">
                            <tr>
                                <td style="margin-top:-10px;">
                                    <img style="width:50%;height:50%;" src="${companyInformation.logoUrl}"/>
                                </td>
                            </tr>
                            <tr style="line-height:150%;margin-top:10pt;">
                                <td align="left">
                                    <b>SHIP TO</b><br/>${record.shipaddress}
                                </td>
                            </tr>
                        </table>
                    </td>

                    <!-- Middle Section: Custom Artwork -->
                    <#if salesorder.custbody_pir_mockup_url_sales_order?has_content>
                        <td colspan="3" rowspan="5" align="center">
                            <b>Custom Artwork</b><br/>
                            <img width="1.7in" height="1.3in" src="${salesorder.custbody_pir_mockup_url_sales_order}"/>
                        </td>
                    <#else>
                        <td colspan="3" rowspan="5"></td>
                    </#if>

                    <!-- Right Section: Order Details -->
                    <td colspan="5" rowspan="5" align="right">
                        <table style="width:100%;">
                            <tr>
                                <td colspan="20" align="right" style="font-size:20pt;line-height:130%;">
                                    ${record@title}
                                </td>
                            </tr>
                            <tr style="border-bottom:1pt solid black;line-height:130%;padding-bottom:5px;">
                                <td colspan="8" style="font-size:9pt;"><b>Order Number</b></td>
                                <td colspan="12" align="right" style="font-size:9pt;">${salesorder.tranid}</td>
                            </tr>
                            <tr style="border-bottom:1pt solid black;line-height:130%;padding-bottom:5px;">
                                <td colspan="8" style="font-size:9pt;"><b>Item Fulfillment</b></td>
                                <td colspan="12" align="right" style="font-size:9pt;">${record.tranid}</td>
                            </tr>
                            <tr style="border-bottom:1pt solid black;line-height:130%;padding-bottom:5px;">
                                <td colspan="8" style="font-size:9pt;"><b>PO Number</b></td>
                                <td colspan="12" align="right" style="font-size:9pt;">${salesorder.otherrefnum}</td>
                            </tr>
                            <tr style="border-bottom:1pt solid black;line-height:130%;padding-bottom:5px;">
                                <td colspan="8" style="font-size:9pt;"><b>Order Notes</b></td>
                                <td colspan="12" align="right" style="font-size:9pt;">
                                    <#if record.memo?has_content>
                                        ${record.memo}
                                    <#else>
                                        ${salesorder.memo}
                                    </#if>
                                </td>
                            </tr>
                            <tr style="border-bottom:1pt solid black;line-height:130%;padding-bottom:5px;">
                                <td colspan="8" style="font-size:9pt;"><b>${record.shipmethod@label}</b></td>
                                <td colspan="12" align="right" style="font-size:9pt;">${record.shipmethod}</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </macro>

        <!-- Footer with Barcode -->
        <macro id="nlfooter">
            <table class="footer" style="width:100%;">
                <tr>
                    <#if record.shipmethod?contains("LTL") || record.shipmethod?contains("Local Pickup")>
                        <td></td>
                    <#else>
                        <td>
                            <barcode codetype="code128" showtext="true"
                                     value="${record.custbody_pir_shipstation_ordid}" width="150" height="30"/>
                        </td>
                    </#if>
                    <td align="right">Page <pagenumber/> of <totalpages/></td>
                </tr>
            </table>
        </macro>
    </macrolist>

    <!-- Styles -->
    <style type="text/css">
        * {
            <#if .locale == "zh_CN">
                font-family: NotoSans, NotoSansCJKsc, sans-serif;
            <#elseif .locale == "zh_TW">
                font-family: NotoSans, NotoSansCJKtc, sans-serif;
            <#elseif .locale == "ja_JP">
                font-family: NotoSans, NotoSansCJKjp, sans-serif;
            <#elseif .locale == "ko_KR">
                font-family: NotoSans, NotoSansCJKkr, sans-serif;
            <#elseif .locale == "th_TH">
                font-family: NotoSans, NotoSansThai, sans-serif;
            <#else>
                font-family: Lato, NotoSans, sans-serif;
            </#if>
        }
        table { font-size:9pt; table-layout:auto; }
        th { font-weight:bold; font-size:8pt; vertical-align:middle; padding:5pt 6pt 3pt; color:#333; }
        td { padding:4pt 6pt; letter-spacing:normal; word-spacing:normal; }
        table.header td { padding:0; font-size:10pt; }
        table.footer td { font-size:8pt; padding:0; }
        span.title { font-size:28pt; }
        span.itemname { font-weight:bold; line-height:150%; }
        hr { width:100%; color:#d3d3d3; background-color:#d3d3d3; height:1px; }
    </style>
</head>

<body header="nlheader" header-height="25%" footer="nlfooter" footer-height="20pt"
      padding="0.5in 0.5in 0.5in 0.5in" size="Letter">

    <!-- Items Table -->
    <table class="itemtable" style="width:100%;margin-top:30pt;padding-bottom:5pt;">
        <#list salesorder.item as item>
            <#if item_index == 0>
                <thead style="border-bottom:1pt solid black;margin-bottom:7pt;">
                    <tr>
                        <th colspan="2"></th>
                        <th colspan="7">Item</th>
                        <th colspan="10">BARCODE</th>
                        <th colspan="4">BIN</th>
                        <th colspan="4">COLOR</th>
                        <th colspan="2">SIZE</th>
                        <th colspan="2">QTY</th>
                    </tr>
                </thead>
            </#if>
            <tr style="border-bottom: 1px solid rgb(211, 211, 211); margin-bottom: 7px;">
                <td align="left" colspan="2">
                    <#if item.custcol_custom_image_url?has_content>
                        <@filecabinet nstype="image" height="50px" src="${item.custcol_custom_image_url}" style="float: left;" width="40" />
                    <#elseif item.custcol1?has_content>
                        <@filecabinet nstype="image" height="50px" src="${item.custcol1}" style="float: left;" width="40" />
                    </#if>
                </td>
                <td colspan="7">
                    <b>${item.item}</b><br/>${item.description}
                </td>
                
                <#if item.custcol_customization_barcode?has_content>
                    <td colspan="10">
                        <barcode codetype="code128" showtext="true" value="${item.custcol_customization_barcode}" width="150" height="30"/>
                    </td>
                <#else>
                    <td colspan="10"></td>
                </#if>
                
                <td colspan="4">${item.custcol_pir_pick_location}</td>
                <td colspan="4">${item.custcol_line_item_color}</td>
                <td colspan="2">${item.custcol_line_item_size}</td>
                <td colspan="2">${item.quantity}</td>
            </tr>
        </#list>
    </table>

</body>
</pdf>