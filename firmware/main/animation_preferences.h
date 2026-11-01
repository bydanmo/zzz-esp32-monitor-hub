#pragma once
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define ANIMATION_ID_BYTES 17
#define ANIMATION_PREFERENCES_BYTES 24
typedef enum { ANIMATION_SINGLE=0, ANIMATION_SEQUENCE=1 } animation_mode_t;
typedef struct { char id[ANIMATION_ID_BYTES]; animation_mode_t mode; } animation_preferences_t;
bool animation_id_valid(const char *id);
void animation_preferences_init(void);
const animation_preferences_t *animation_preferences_get(void);
bool animation_preferences_select(const char *id, animation_mode_t mode);
/* A distinct NVS blob, independent from brightness, Wi-Fi and Hub configuration. */
bool animation_preferences_storage_load(uint8_t value[ANIMATION_PREFERENCES_BYTES]);
bool animation_preferences_storage_save(const uint8_t value[ANIMATION_PREFERENCES_BYTES]);
