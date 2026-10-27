#include "video_player.h"

#include <stdio.h>
#include <string.h>
#include "driver/sdmmc_host.h"
#include "esp_check.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_vfs_fat.h"
#include "sdmmc_cmd.h"

#include "board_config.h"
#include "board_display.h"
#include "media_assets.h"
#include "crt_clock.h"

#define VIDEO_PATH "/sdcard/wallpaper.rgb565"
#define VIDEO_WIDTH BOARD_LCD_WIDTH
#define VIDEO_HEIGHT BOARD_LCD_HEIGHT
#define VIDEO_FPS 8
#define VIDEO_CHUNK_LINES 32
#define VIDEO_FRAME_BYTES ((size_t)VIDEO_WIDTH * VIDEO_HEIGHT * sizeof(uint16_t))
#define VIDEO_CHUNK_BYTES ((size_t)VIDEO_WIDTH * VIDEO_CHUNK_LINES * sizeof(uint16_t))
#define VIDEO_FRAME_INTERVAL_US (1000000LL / VIDEO_FPS)

static const char *TAG = "video-player";
static sdmmc_card_t *card;
static FILE *video_file;
static uint8_t *chunk_buffer;
static uint8_t *second_chunk;
static size_t frame_count;
static size_t current_frame;
static int64_t next_frame_us;
static int64_t playback_started_us;
static int64_t log_started_us;
static size_t logged_frames;
static bool active;
static uint32_t clock_anchor;
static int64_t clock_received_ms;
static bool clock_valid;
static uint32_t clock_drawn_second = UINT32_MAX;
static uint32_t clock_updates;

void video_player_set_clock(uint32_t seconds, int64_t received_ms, bool valid)
{
    if (!valid) return;
    if (!clock_valid) ESP_LOGI(TAG,"Clock synchronized from Hub: %02lu:%02lu:%02lu UTC+8",
        (unsigned long)(seconds/3600),(unsigned long)((seconds/60)%60),(unsigned long)(seconds%60));
    clock_anchor=seconds; clock_received_ms=received_ms; clock_valid=true;
}
static int active_width=VIDEO_WIDTH,active_height=VIDEO_HEIGHT;
static int origin_x,origin_y;
static int64_t frame_interval_us=VIDEO_FRAME_INTERVAL_US;
static size_t active_frame_bytes=VIDEO_FRAME_BYTES;
static int active_asset=-1;
static int64_t read_time_us,send_time_us;
static size_t skipped_frames;

static void prepare_pipeline(void)
{
    if(!second_chunk) second_chunk=heap_caps_malloc(VIDEO_CHUNK_BYTES,MALLOC_CAP_DMA|MALLOC_CAP_INTERNAL);
    ESP_LOGI(TAG,"Video buffers: %s",second_chunk?"double; SD/LCD overlapped":"single; sequential fallback");
}

static esp_err_t select_asset(int index,int64_t now_us)
{
    const media_asset_t *asset=&media_assets[index];
    const uint8_t *background=media_assets_data(1);
    if(!media_assets_data(index) || !background || media_assets[1].bytes!=(size_t)VIDEO_WIDTH*VIDEO_HEIGHT*2) return ESP_ERR_INVALID_STATE;
    if(!chunk_buffer) chunk_buffer=heap_caps_malloc(VIDEO_CHUNK_BYTES,MALLOC_CAP_DMA|MALLOC_CAP_INTERNAL);
    if(!chunk_buffer) return ESP_ERR_NO_MEM;
    prepare_pipeline();
    active_asset=index;
    clock_drawn_second=UINT32_MAX;
    clock_updates=0;
    active_width=asset->width;active_height=asset->height;
    origin_x=asset->x;origin_y=asset->y;
    frame_interval_us=1000000LL/asset->fps;
    active_frame_bytes=(size_t)active_width*active_height*2;
    frame_count=asset->bytes/active_frame_bytes;current_frame=0;
    logged_frames=skipped_frames=0;read_time_us=send_time_us=0;
    for(int y=0;y<VIDEO_HEIGHT;y+=VIDEO_CHUNK_LINES) {
        int lines=VIDEO_HEIGHT-y;if(lines>VIDEO_CHUNK_LINES) lines=VIDEO_CHUNK_LINES;
        size_t bytes=(size_t)VIDEO_WIDTH*lines*2;
        memcpy(chunk_buffer,background+(size_t)y*VIDEO_WIDTH*2,bytes);
        ESP_RETURN_ON_ERROR(board_display_write_rgb565be(y,lines,chunk_buffer,bytes),TAG,"CRT scene draw failed");
    }
    now_us=esp_timer_get_time();
    playback_started_us=next_frame_us=log_started_us=now_us;
    ESP_LOGI(TAG,"CRT cinema: %dx%d at %d,%d, source %d FPS; PSRAM frames, static room",
             active_width,active_height,origin_x,origin_y,asset->fps);
    return ESP_OK;
}

static esp_err_t rewind_video(void)
{
    if (fseek(video_file, 0, SEEK_SET) != 0) {
        ESP_LOGE(TAG, "Failed to rewind %s", VIDEO_PATH);
        return ESP_FAIL;
    }
    clearerr(video_file);
    current_frame = 0;
    return ESP_OK;
}

esp_err_t video_player_init(void)
{
    if (video_player_is_available()) return ESP_OK;
    /* A card/file absent at boot may become available later. Retry without
     * mounting an already mounted card or leaking a partially opened file. */
    if (video_file != NULL) { fclose(video_file); video_file = NULL; }
    const esp_vfs_fat_sdmmc_mount_config_t mount_config = {
        .format_if_mount_failed = false,
        .max_files = 2,
        .allocation_unit_size = 32 * 1024,
    };
    sdmmc_host_t host = SDMMC_HOST_DEFAULT();
    host.max_freq_khz = SDMMC_FREQ_HIGHSPEED;
    sdmmc_slot_config_t slot = SDMMC_SLOT_CONFIG_DEFAULT();
    slot.width = 4;
    slot.clk = BOARD_SD_CLK_GPIO;
    slot.cmd = BOARD_SD_CMD_GPIO;
    slot.d0 = BOARD_SD_D0_GPIO;
    slot.d1 = BOARD_SD_D1_GPIO;
    slot.d2 = BOARD_SD_D2_GPIO;
    slot.d3 = BOARD_SD_D3_GPIO;
    slot.flags |= SDMMC_SLOT_FLAG_INTERNAL_PULLUP;

    if (card == NULL) {
        esp_err_t result = esp_vfs_fat_sdmmc_mount("/sdcard", &host, &slot,
                                                &mount_config, &card);
        if (result != ESP_OK) {
            card = NULL;
            ESP_LOGW(TAG, "TF card mount failed: %s", esp_err_to_name(result));
            return result;
        }
        sdmmc_card_print_info(stdout, card);
    }

    video_file = fopen(VIDEO_PATH, "rb");
    if (video_file == NULL) {
        ESP_LOGW(TAG, "Video file not found: %s", VIDEO_PATH);
        return ESP_ERR_NOT_FOUND;
    }
    if (fseek(video_file, 0, SEEK_END) != 0) {
        fclose(video_file); video_file = NULL;
        return ESP_FAIL;
    }
    long file_size = ftell(video_file);
    if (file_size <= 0 || (size_t)file_size % VIDEO_FRAME_BYTES != 0) {
        ESP_LOGE(TAG, "Invalid video size: %ld (frame size %u)",
                 file_size, (unsigned)VIDEO_FRAME_BYTES);
        fclose(video_file);
        video_file = NULL;
        return ESP_ERR_INVALID_SIZE;
    }
    frame_count = (size_t)file_size / VIDEO_FRAME_BYTES;
    esp_err_t rewind_result = rewind_video();
    if (rewind_result != ESP_OK) {
        fclose(video_file); video_file = NULL;
        return rewind_result;
    }

    chunk_buffer = heap_caps_malloc(VIDEO_CHUNK_BYTES,
                                    MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
    if (chunk_buffer == NULL) {
        ESP_LOGE(TAG, "Unable to allocate %u-byte DMA video buffer",
                 (unsigned)VIDEO_CHUNK_BYTES);
        fclose(video_file);
        video_file = NULL;
        return ESP_ERR_NO_MEM;
    }
    ESP_LOGI(TAG, "Ready: %s, %u frames, %u FPS, 480x320 RGB565BE",
             VIDEO_PATH, (unsigned)frame_count, VIDEO_FPS);
    return ESP_OK;
}

bool video_player_is_available(void)
{
    return media_assets_ready() || (video_file != NULL && chunk_buffer != NULL && frame_count > 0);
}

bool video_player_storage_mounted(void) { return card != NULL; }

esp_err_t video_player_start(int64_t now_us)
{
    if(media_assets_ready()) {
        ESP_RETURN_ON_ERROR(select_asset(0,now_us),TAG,"Unable to open CRT asset");
        active=true;
        ESP_LOGI(TAG,"Video screensaver started; CRT cinema");
        return ESP_OK;
    }
    if (!video_player_is_available()) {
        ESP_RETURN_ON_ERROR(video_player_init(), TAG, "Unable to recover video resource");
    }
    ESP_RETURN_ON_ERROR(rewind_video(), TAG, "Unable to start video");
    prepare_pipeline();
    next_frame_us = now_us;
    playback_started_us = now_us;
    log_started_us = now_us;
    logged_frames = 0;
    read_time_us=send_time_us=0; skipped_frames=0;
    active = true;
    ESP_LOGI(TAG, "Video screensaver started");
    return ESP_OK;
}

esp_err_t video_player_step(int64_t now_us)
{
    if (!active) return ESP_ERR_INVALID_STATE;
    if (now_us < next_frame_us) return ESP_OK;

    const int64_t elapsed_us = now_us - playback_started_us;
    const size_t timeline_frame =
        (size_t)(elapsed_us / frame_interval_us) % frame_count;
    if (current_frame != timeline_frame) {
        skipped_frames+=(timeline_frame+frame_count-current_frame%frame_count)%frame_count;
        const long offset = (long)(timeline_frame * active_frame_bytes);
        if (active_asset<0 && fseek(video_file, offset, SEEK_SET) != 0) {
            ESP_LOGE(TAG, "Failed to seek to frame %u",
                     (unsigned)timeline_frame);
            active = false;
            return ESP_FAIL;
        }
        if(active_asset<0) clearerr(video_file);
        current_frame = timeline_frame;
    }

    /* Reuse the full byte capacity for narrow windows: fewer SPI transactions
     * and semaphore wakeups without increasing internal DMA memory. */
    const int stripe_lines=VIDEO_CHUNK_BYTES/((size_t)active_width*2);
    int stripe=0;
    for (int y = 0; y < active_height; y += stripe_lines,++stripe) {
        int lines=active_height-y; if(lines>stripe_lines) lines=stripe_lines;
        size_t chunk_bytes=(size_t)active_width*lines*2;
        uint8_t *pixels=(second_chunk && stripe%2)?second_chunk:chunk_buffer;
        if(!second_chunk) ESP_RETURN_ON_ERROR(board_display_wait(),TAG,"LCD buffer still borrowed");
        int64_t stage_us=esp_timer_get_time();
        size_t bytes_read;
        if(active_asset>=0) {
            const uint8_t *source=media_assets_data((unsigned)active_asset);
            memcpy(pixels,source+timeline_frame*active_frame_bytes+(size_t)y*active_width*2,chunk_bytes);
            bytes_read=chunk_bytes;
        } else bytes_read = fread(pixels, 1, chunk_bytes, video_file);
        read_time_us+=esp_timer_get_time()-stage_us;
        if (bytes_read != chunk_bytes) {
            ESP_LOGE(TAG, "TF read failed at frame %u row %d: read %u/%u bytes",
                     (unsigned)current_frame, y, (unsigned)bytes_read,
                     (unsigned)chunk_bytes);
            active = false;
            return ESP_FAIL;
        }
        stage_us=esp_timer_get_time();
        ESP_RETURN_ON_ERROR(board_display_queue_rect_rgb565be(
                                origin_x,origin_y+y,active_width,lines,pixels,
                                chunk_bytes),
                            TAG, "LCD video transfer failed");
        send_time_us+=esp_timer_get_time()-stage_us;
    }
    int64_t final_wait_us=esp_timer_get_time();
    ESP_RETURN_ON_ERROR(board_display_wait(),TAG,"Last video stripe incomplete");
    if (active_asset>=0) {
        uint32_t seconds=clock_valid ? crt_clock_seconds(clock_anchor,clock_received_ms,now_us/1000) : 0;
        if (clock_drawn_second!=seconds) {
            crt_clock_render(chunk_buffer,media_assets_data(1),seconds,clock_valid);
            ESP_RETURN_ON_ERROR(board_display_write_rect_rgb565be(CRT_CLOCK_X,CRT_CLOCK_Y,
                CRT_CLOCK_WIDTH,CRT_CLOCK_HEIGHT,chunk_buffer,CRT_CLOCK_WIDTH*CRT_CLOCK_HEIGHT*2),TAG,"Clock draw failed");
            clock_drawn_second=seconds;
            ++clock_updates;
        }
    }
    send_time_us+=esp_timer_get_time()-final_wait_us;
    current_frame += 1;
    logged_frames += 1;
    const int64_t timeline_tick = elapsed_us / frame_interval_us;
    next_frame_us = playback_started_us +
                    (timeline_tick + 1) * frame_interval_us;
    int64_t completed_us=esp_timer_get_time();
    if (completed_us - log_started_us >= 10000000LL) {
        double fps = (double)logged_frames * 1000000.0 /
                     (double)(completed_us - log_started_us);
        ESP_LOGI(TAG, "Playback %s %.2f display FPS, read %.2f ms/frame, LCD wait %.2f ms/frame, skipped %u, source frame %u/%u, clock updates %lu",
                 active_asset<0?"legacy":"crt",fps,
                 read_time_us/1000.0/logged_frames,send_time_us/1000.0/logged_frames,
                 (unsigned)skipped_frames,(unsigned)current_frame,(unsigned)frame_count,(unsigned long)clock_updates);
        log_started_us = completed_us;
        logged_frames = 0;
        read_time_us=send_time_us=0; skipped_frames=0;
    }
    return ESP_OK;
}

void video_player_stop(void)
{
    /* Also release the final borrowed buffer on a read/transfer error. */
    (void)board_display_wait();
    if (active) ESP_LOGI(TAG, "Video screensaver stopped");
    active = false;
}

bool video_player_is_active(void)
{
    return active;
}
