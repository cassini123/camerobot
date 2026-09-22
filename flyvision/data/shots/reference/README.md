# Reference stills

`shot_01.bmp` / `shot_02.bmp` / `shot_03.bmp` are synthetic stand-ins for
CinePath stills (hall + person blocks). Replace them with real OV2640
captures when the CAM stream is up:

```text
flyvision/data/shots/reference/shot_01.bmp
flyvision/data/shots/reference/shot_02.bmp
flyvision/data/shots/reference/shot_03.bmp
```

Rebuild the placeholders:

```bash
PYTHONPATH=flyvision/python python3 flyvision/data/shots/reference/build_placeholders.py
```
