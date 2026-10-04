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
 *   GET /capture  single JPEG (HTML error if grab fails — Safari will not be blank)
 *   GET /status   heap + framesize JSON
 */

#include "esp_camera.h"
#include "esp_http_server.h"
#include "esp_timer.h"
#include "esp_heap_caps.h"
#include <WiFi.h>

#include "camera_pins.h"
#include "config.h"

#define FLYVISION_FW "qvga-dram-5"

static const char STREAM_CONTENT_TYPE[] = "multipart/x-mixed-replace;boundary=frame";
static const char STREAM_BOUNDARY[] = "\r\n--frame\r\n";
static const char STREAM_PART[] = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

// Safari cannot show MJPEG in <img src="/stream"> — that looks like a blank page.
// Serve a still JPEG and text links instead.
static const char INDEX_HTML[] PROGMEM = R"HTML(
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>flyvision CAM</title></head>
<body style="margin:0;background:#111;color:#eee;font:16px sans-serif;padding:24px">
  <h1 style="font-size:20px">flyvision CAM</h1>
  <p>不要用 Safari 打开 /stream，会整页发白。先看下面这张静图。</p>
  <p>
    <a href="/capture" style="color:#9cf">/capture</a> ·
    <a href="/status" style="color:#9cf">/status</a>
  </p>
  <img src="/capture" alt="capture" style="width:100%;max-width:640px;background:#333"/>
</body>
</html>
)HTML";

static bool g_camera_ok = false;
static uint32_t g_last_jpeg_len = 0;
static const char *g_camera_mode = "none";

static camera_config_t make_camera_config(framesize_t size, bool use_psram, int xclk_hz) {
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
  config.xclk_freq_hz = xclk_hz;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = size;
  config.jpeg_quality = FLYVISION_JPEG_QUALITY;
  if (use_psram && psramFound()) {
    config.fb_count = 2;
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.grab_mode = CAMERA_GRAB_LATEST;
  } else {
    config.fb_count = 1;
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  }
  return config;
}

static camera_fb_t *grab_frame() {
  for (int i = 0; i < 8; ++i) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb != nullptr) {
      g_last_jpeg_len = fb->len;
      return fb;
    }
    delay(40);
  }
  return nullptr;
}

static bool probe_frame() {
  Serial.println("camera grab...");
  Serial.flush();
  camera_fb_t *fb = grab_frame();
  if (fb == nullptr) {
    Serial.println("camera probe: no jpeg");
    return false;
  }
  Serial.printf("camera probe: jpeg %u bytes\n", (unsigned)fb->len);
  esp_camera_fb_return(fb);
  return true;
}

static bool init_camera(framesize_t size, bool use_psram, int xclk_hz) {
  camera_config_t config = make_camera_config(size, use_psram, xclk_hz);
  Serial.printf("camera init size=%u psram=%d xclk=%d\n", (unsigned)size, use_psram, xclk_hz);
  Serial.flush();
  esp_err_t err = esp_camera_init(&config);
  Serial.printf("camera init done err=0x%x\n", err);
  Serial.flush();
  if (err != ESP_OK) {
    return false;
  }
  sensor_t *sensor = esp_camera_sensor_get();
  if (sensor != nullptr) {
    sensor->set_framesize(sensor, size);
    sensor->set_quality(sensor, FLYVISION_JPEG_QUALITY);
    sensor->set_vflip(sensor, 0);
    sensor->set_hmirror(sensor, 0);
    sensor->set_whitebal(sensor, 1);
    sensor->set_gain_ctrl(sensor, 1);
    sensor->set_exposure_ctrl(sensor, 1);
  }
  delay(200);
  return probe_frame();
}

static bool start_camera() {
  // AI-Thinker flash LED sits on GPIO4 and can brown out a weak USB 5V rail.
  pinMode(4, OUTPUT);
  digitalWrite(4, LOW);

  Serial.printf("psramFound=%d\n", psramFound() ? 1 : 0);

  struct Try {
    framesize_t size;
    bool psram;
    int xclk;
    const char *name;
  };
  const Try tries[] = {
      {FRAMESIZE_QVGA, true, 10000000, "QVGA PSRAM 10MHz"},
      {FRAMESIZE_QVGA, false, 10000000, "QVGA DRAM 10MHz"},
      {FRAMESIZE_QVGA, false, 8000000, "QVGA DRAM 8MHz"},
      {FRAMESIZE_QQVGA, false, 8000000, "QQVGA DRAM 8MHz"},
  };

  for (size_t i = 0; i < sizeof(tries) / sizeof(tries[0]); ++i) {
    Serial.printf("camera try %s\n", tries[i].name);
    Serial.flush();
    if (init_camera(tries[i].size, tries[i].psram, tries[i].xclk)) {
      g_camera_ok = true;
      g_camera_mode = tries[i].name;
      Serial.printf("camera ok %s\n", tries[i].name);
      return true;
    }
    esp_camera_deinit();
    delay(150);
  }
  g_camera_ok = false;
  g_camera_mode = "failed";
  return false;
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

static void add_cors(httpd_req_t *req) {
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
}

static esp_err_t send_html(httpd_req_t *req, const char *status, const char *body) {
  httpd_resp_set_status(req, status);
  httpd_resp_set_type(req, "text/html; charset=utf-8");
  add_cors(req);
  return httpd_resp_send(req, body, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t index_handler(httpd_req_t *req) {
  add_cors(req);
  httpd_resp_set_type(req, "text/html");
  return httpd_resp_send(req, INDEX_HTML, HTTPD_RESP_USE_STRLEN);
}

static const char *framesize_name(framesize_t size) {
  switch (size) {
    case FRAMESIZE_QQVGA:
      return "QQVGA";
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
  char body[384];
  snprintf(
      body,
      sizeof(body),
      "{\"fw\":\"%s\",\"camera_ok\":%s,\"mode\":\"%s\",\"last_jpeg\":%u,\"heap\":%u,"
      "\"framesize\":\"%s\",\"pixformat\":\"JPEG\",\"wifi\":\"%s\",\"ip\":\"%u.%u.%u.%u\"}",
      FLYVISION_FW,
      g_camera_ok ? "true" : "false",
      g_camera_mode,
      (unsigned)g_last_jpeg_len,
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
  add_cors(req);
  return httpd_resp_send(req, body, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t capture_handler(httpd_req_t *req) {
  camera_fb_t *fb = grab_frame();
  if (!fb) {
    Serial.println("capture: fb grab failed");
    return send_html(
        req,
        "503 Service Unavailable",
        "<!DOCTYPE html><html><head><meta charset='utf-8'><title>no jpeg</title></head>"
        "<body style='font:16px sans-serif;padding:24px;background:#111;color:#eee'>"
        "<h1>摄像头没拿到图</h1>"
        "<p>不是网址错了。Safari 以前把这个失败显示成白页。</p>"
        "<p>打开 Arduino 串口（115200），看有没有 <code>fb grab failed</code> 或 "
        "<code>EV-VSYNC-OVF</code>。</p>"
        "<p><a href='/status' style='color:#9cf'>打开 /status</a></p>"
        "</body></html>");
  }
  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
  add_cors(req);
  esp_err_t err = httpd_resp_send(req, (const char *)fb->buf, fb->len);
  esp_camera_fb_return(fb);
  return err;
}

static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t *first = grab_frame();
  if (!first) {
    Serial.println("fb grab failed");
    return send_html(
        req,
        "503 Service Unavailable",
        "<!DOCTYPE html><html><head><meta charset='utf-8'><title>no jpeg</title></head>"
        "<body style='font:16px sans-serif;padding:24px;background:#111;color:#eee'>"
        "<h1>摄像头没拿到图，没法推流</h1>"
        "<p><a href='/status' style='color:#9cf'>打开 /status</a> · "
        "<a href='/capture' style='color:#9cf'>/capture</a></p>"
        "</body></html>");
  }
  add_cors(req);
  esp_err_t err = httpd_resp_set_type(req, STREAM_CONTENT_TYPE);
  if (err != ESP_OK) {
    esp_camera_fb_return(first);
    return err;
  }
  char part[64];
  camera_fb_t *fb = first;
  while (true) {
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
    fb = grab_frame();
    if (!fb) {
      Serial.println("fb grab failed");
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

static void camera_task(void *) {
  if (!start_camera()) {
    Serial.println("camera failed; AP already up — open /status then /capture");
  }
  vTaskDelete(nullptr);
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println("flyvision CAM collector");
  Serial.printf("fw=%s default=%s\n", FLYVISION_FW, "QVGA");
  // AP first so Safari /status works even if the sensor hangs on init.
  start_wifi();
  start_http();
  xTaskCreatePinnedToCore(camera_task, "cam", 8192, nullptr, 1, nullptr, 1);
}

void loop() {
  delay(1000);
}
