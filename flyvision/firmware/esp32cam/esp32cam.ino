/*
 * flyvision ESP32-CAM firmware (phase 1)
 *
 * Board: AI-Thinker ESP32-CAM + OV2640
 * Role:  JPEG collector only. The PC runs OpenCV / shot matching.
 *
 * Power: 5V on the CAM 5V pin, after a LiPo -> DC-DC buck.
 *        Do not feed the pack into 5V. Do not feed 3.3V into the 5V pin
 *        just because the ESP32 chip itself is 3.3V.
 *
 * HTTP:
 *   GET /         simple stream page
 *   GET /stream   multipart MJPEG
 *   GET /capture  single JPEG
 *   GET /status   heap + framesize JSON
 */

#include "esp_camera.h"
#include "esp_http_server.h"
#include "esp_timer.h"
#include "esp_heap_caps.h"
#include <WiFi.h>

#include "camera_pins.h"
#include "config.h"

static const char STREAM_CONTENT_TYPE[] = "multipart/x-mixed-replace;boundary=frame";
static const char STREAM_BOUNDARY[] = "\r\n--frame\r\n";
static const char STREAM_PART[] = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

static const char INDEX_HTML[] PROGMEM = R"HTML(
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>flyvision CAM</title></head>
<body style="margin:0;background:#111;color:#eee;font:14px sans-serif">
  <p style="padding:8px 12px">flyvision collector — /stream</p>
  <img src="/stream" style="width:100%;max-width:640px"/>
</body>
</html>
)HTML";

static camera_config_t make_camera_config() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FLYVISION_FRAMESIZE;
  config.jpeg_quality = FLYVISION_JPEG_QUALITY;
  config.fb_count = 2;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.grab_mode = CAMERA_GRAB_LATEST;
  return config;
}

static bool start_camera() {
  camera_config_t config = make_camera_config();
  if (psramFound()) {
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QVGA;
    config.fb_count = 1;
    config.fb_location = CAMERA_FB_IN_DRAM;
  }
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("camera init failed: 0x%x\n", err);
    return false;
  }
  sensor_t *sensor = esp_camera_sensor_get();
  if (sensor != nullptr) {
    sensor->set_framesize(sensor, config.frame_size);
    sensor->set_vflip(sensor, 0);
    sensor->set_hmirror(sensor, 0);
  }
  return true;
}

static void start_wifi() {
#if FLYVISION_WIFI_AP
  WiFi.mode(WIFI_AP);
  WiFi.softAP(FLYVISION_AP_SSID, FLYVISION_AP_PASS);
  Serial.print("AP IP ");
  Serial.println(WiFi.softAPIP());
#else
  WiFi.mode(WIFI_STA);
  WiFi.begin(FLYVISION_STA_SSID, FLYVISION_STA_PASS);
  Serial.print("STA connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("STA IP ");
  Serial.println(WiFi.localIP());
#endif
}

static esp_err_t index_handler(httpd_req_t *req) {
  httpd_resp_set_type(req, "text/html");
  return httpd_resp_send(req, INDEX_HTML, HTTPD_RESP_USE_STRLEN);
}

static const char *framesize_name(framesize_t size) {
  switch (size) {
    case FRAMESIZE_QVGA:
      return "QVGA";
    case FRAMESIZE_VGA:
      return "VGA";
    case FRAMESIZE_SVGA:
      return "SVGA";
    default:
      return "other";
  }
}

static esp_err_t status_handler(httpd_req_t *req) {
  sensor_t *sensor = esp_camera_sensor_get();
  const char *size_name = sensor ? framesize_name(sensor->status.framesize) : "unknown";
  IPAddress ip =
#if FLYVISION_WIFI_AP
      WiFi.softAPIP();
#else
      WiFi.localIP();
#endif
  char body[256];
  snprintf(
      body,
      sizeof(body),
      "{\"heap\":%u,\"framesize\":\"%s\",\"pixformat\":\"JPEG\",\"wifi\":\"%s\",\"ip\":\"%u.%u.%u.%u\"}",
      (unsigned)esp_get_free_heap_size(),
      size_name,
#if FLYVISION_WIFI_AP
      "AP",
#else
      "STA",
#endif
      ip[0],
      ip[1],
      ip[2],
      ip[3]);
  httpd_resp_set_type(req, "application/json");
  return httpd_resp_send(req, body, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t capture_handler(httpd_req_t *req) {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    httpd_resp_send_500(req);
    return ESP_FAIL;
  }
  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
  esp_err_t err = httpd_resp_send(req, (const char *)fb->buf, fb->len);
  esp_camera_fb_return(fb);
  return err;
}

static esp_err_t stream_handler(httpd_req_t *req) {
  esp_err_t err = httpd_resp_set_type(req, STREAM_CONTENT_TYPE);
  if (err != ESP_OK) {
    return err;
  }
  char part[64];
  while (true) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("fb grab failed");
      return ESP_FAIL;
    }
    size_t header_len = snprintf(part, sizeof(part), STREAM_PART, fb->len);
    err = httpd_resp_send_chunk(req, STREAM_BOUNDARY, strlen(STREAM_BOUNDARY));
    if (err == ESP_OK) {
      err = httpd_resp_send_chunk(req, part, header_len);
    }
    if (err == ESP_OK) {
      err = httpd_resp_send_chunk(req, (const char *)fb->buf, fb->len);
    }
    esp_camera_fb_return(fb);
    if (err != ESP_OK) {
      break;
    }
  }
  return err;
}

static void start_http() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  config.stack_size = 8192;
  httpd_handle_t server = nullptr;
  if (httpd_start(&server, &config) != ESP_OK) {
    Serial.println("httpd start failed");
    return;
  }
  httpd_uri_t index_uri = {};
  index_uri.uri = "/";
  index_uri.method = HTTP_GET;
  index_uri.handler = index_handler;
  httpd_uri_t status_uri = {};
  status_uri.uri = "/status";
  status_uri.method = HTTP_GET;
  status_uri.handler = status_handler;
  httpd_uri_t capture_uri = {};
  capture_uri.uri = "/capture";
  capture_uri.method = HTTP_GET;
  capture_uri.handler = capture_handler;
  httpd_uri_t stream_uri = {};
  stream_uri.uri = "/stream";
  stream_uri.method = HTTP_GET;
  stream_uri.handler = stream_handler;
  httpd_register_uri_handler(server, &index_uri);
  httpd_register_uri_handler(server, &status_uri);
  httpd_register_uri_handler(server, &capture_uri);
  httpd_register_uri_handler(server, &stream_uri);
  Serial.println("HTTP on :80  /  /stream  /capture  /status");
}

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("flyvision CAM collector");
  if (!start_camera()) {
    Serial.println("halt: camera failed (check 5V supply and OV2640 seating)");
    return;
  }
  start_wifi();
  start_http();
}

void loop() {
  delay(1000);
}
