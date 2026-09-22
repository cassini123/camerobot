#pragma once

// flyvision phase-1 camera collector.
// CAM is only an eye: JPEG stream over Wi-Fi. No on-board AI.

// 1 = soft AP (default, no home router needed)
// 0 = join an existing STA network
#ifndef FLYVISION_WIFI_AP
#define FLYVISION_WIFI_AP 1
#endif

#ifndef FLYVISION_AP_SSID
#define FLYVISION_AP_SSID "flyvision-cam"
#endif

#ifndef FLYVISION_AP_PASS
#define FLYVISION_AP_PASS "flyvision"
#endif

#ifndef FLYVISION_STA_SSID
#define FLYVISION_STA_SSID "your-wifi"
#endif

#ifndef FLYVISION_STA_PASS
#define FLYVISION_STA_PASS "your-password"
#endif

// FRAMESIZE_VGA (640x480) for live view; FRAMESIZE_QVGA for matching bandwidth.
#ifndef FLYVISION_FRAMESIZE
#define FLYVISION_FRAMESIZE FRAMESIZE_VGA
#endif

#ifndef FLYVISION_JPEG_QUALITY
#define FLYVISION_JPEG_QUALITY 12
#endif
