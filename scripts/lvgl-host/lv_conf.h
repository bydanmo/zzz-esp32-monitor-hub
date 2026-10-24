#ifndef LV_CONF_H
#define LV_CONF_H
/* Offscreen RGB565 review: uses the same LVGL 8.4 sources and UI as firmware.
 * Host malloc and an RGB bitmap sink substitute only hardware/allocator layers. */
#define LV_COLOR_DEPTH 16
#define LV_COLOR_16_SWAP 0
#define LV_MEM_CUSTOM 1
#define LV_MEM_CUSTOM_INCLUDE <stdlib.h>
#define LV_MEM_CUSTOM_ALLOC malloc
#define LV_MEM_CUSTOM_FREE free
#define LV_MEM_CUSTOM_REALLOC realloc
#define LV_FONT_MONTSERRAT_14 1
#define LV_USE_LOG 0
#define LV_USE_PERF_MONITOR 0
#define LV_USE_MEM_MONITOR 0
#endif
