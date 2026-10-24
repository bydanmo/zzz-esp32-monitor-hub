#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct {
    const char *path;
    const char *remote;
    int width, height, x, y, fps;
    size_t bytes;
    uint32_t crc;
} media_asset_t;

extern const media_asset_t media_assets[2];
void media_assets_sync(bool online, bool storage_mounted);
bool media_assets_ready(void);
bool media_assets_busy(void);
const uint8_t *media_assets_data(unsigned index);
