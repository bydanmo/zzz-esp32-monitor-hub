#pragma once
#include <stdbool.h>
#include <stdint.h>

#define CRT_CLOCK_X 328
#define CRT_CLOCK_Y 14
#define CRT_CLOCK_WIDTH 98
#define CRT_CLOCK_HEIGHT 44

/* The existing Hub deviceTime is UTC ISO8601; this display uses UTC+8. */
bool crt_clock_parse(const char *iso, uint32_t *seconds);
uint32_t crt_clock_seconds(uint32_t anchor, int64_t received_ms, int64_t now_ms);
void crt_clock_render(uint8_t *pixels, const uint8_t *background, uint32_t seconds, bool valid);
