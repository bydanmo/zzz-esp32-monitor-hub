#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "media_catalog.h"

typedef struct {
    const char *path;
    const char *remote;
    int width, height, x, y, fps;
    size_t bytes;
    uint32_t crc;
} media_asset_t;

extern const media_asset_t media_assets[2];
void media_assets_sync(bool online, bool storage_mounted, bool allow_prefetch);
bool media_assets_ready(void);
bool media_assets_busy(void);
const uint8_t *media_assets_data(unsigned index);
const media_asset_t *media_assets_current(unsigned index);
typedef enum { MEDIA_WAITING,MEDIA_DOWNLOADING,MEDIA_LOADING,MEDIA_READY,MEDIA_FAILED,MEDIA_CHECKING } media_status_t;
typedef struct {
    unsigned count;
    struct { char id[17],label[17]; bool cached; } entries[MEDIA_CATALOG_MAX];
    char loaded_id[17],requested_id[17];
    media_status_t status;
    uint32_t received,total;
    bool storage,online,busy,prefetching,prefetch_error;
    unsigned cached_count;
    char transfer_label[17];
} media_library_snapshot_t;
void media_assets_init(void);
void media_assets_snapshot(media_library_snapshot_t *snapshot);
bool media_assets_request(const char *id,bool preview);
void media_assets_prepare_selected(void);
bool media_assets_take_preview(void);
void media_assets_cancel_preview(void);
void media_assets_session_started(void);
