#pragma once
#include "animation_preferences.h"

#define MEDIA_CATALOG_MAX 8
#define MEDIA_MAX_BYTES (198u*150u*2u*120u)
typedef struct {
    char id[17],label[17],remote[96];
    uint32_t bytes,crc;
    int width,height,x,y,fps;
} media_clip_t;
bool media_clip_valid(const media_clip_t *clip);
int media_catalog_find(const media_clip_t *clips,unsigned count,const char *id);
int media_catalog_next(const media_clip_t *clips,unsigned count,const char *id);
int media_catalog_start(const media_clip_t *clips,unsigned count,const animation_preferences_t *preferences);
/* Resolve once per automatic session; previews and preparation do not consume it. */
int media_catalog_session_start(const media_clip_t *clips,unsigned count,
                               const animation_preferences_t *preferences,const char *last_automatic_id);
/* Decode into an unpublished MEDIA_CATALOG_MAX-sized scratch array. */
bool media_catalog_decode(const char *json,media_clip_t *clips,unsigned *count,uint32_t *background_crc);
