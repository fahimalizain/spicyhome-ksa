
# PrinterArabicConfigDto

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **encoding** | [**inline**](#Encoding) | How to encode Arabic Unicode -&gt; bytes before send |  |
| **codePage** | **kotlin.Int** | ESC t n code-page index (0-255). Vendor-specific. |  |
| **visualRtl** | **kotlin.Boolean** | Reverse glyph order for LTR thermal heads (visual RTL) |  |
| **renderMode** | [**inline**](#RenderMode) | How to render Arabic lines: charset &#x3D; ESC t code-page bytes (isolated glyphs, correct order); raster &#x3D; GS v 0 bitmaps (joined Arabic, requires glyph atlas) |  |


<a id="Encoding"></a>
## Enum: encoding
| Name | Value |
| ---- | ----- |
| encoding | none, utf8, pc864, w1256 |


<a id="RenderMode"></a>
## Enum: renderMode
| Name | Value |
| ---- | ----- |
| renderMode | charset, raster |



