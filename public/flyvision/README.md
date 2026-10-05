YOLOv8n ONNX for the in-page matcher.

`yolov8n.onnx` is exported from the official Ultralytics `yolov8n.pt`
(COCO, 640, opset 12). The workbench loads it at `/flyvision/yolov8n.onnx`.

onnxruntime-web WASM lives in `ort/` and is copied from `node_modules`
on `npm install` / `npm run dev`, so YOLO works after joining `flyvision-cam`
(that AP has no internet, so a jsDelivr import would stay gray).
