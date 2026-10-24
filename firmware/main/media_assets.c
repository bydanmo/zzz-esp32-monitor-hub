#include "media_assets.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#include <stdatomic.h>
#include "esp_http_client.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "wifi_config.h"

/* Original wallpaper.rgb565 stays available as the offline fallback. */
#include "media_assets.generated.h"
static const char *TAG="media-assets";
static _Atomic bool ready, busy;
static int64_t last_attempt_us;
static uint32_t crc_table[256];
static uint8_t *cached_data[2];
static uint32_t crc_update(uint32_t crc,const uint8_t *data,size_t count);

static bool cache_in_psram(int index,uint8_t *buffer,size_t capacity)
{
    if(cached_data[index]) return true;
    const media_asset_t *asset=&media_assets[index];
    if(asset->bytes>8u*1024*1024-512u*1024) return false;
    uint8_t *data=heap_caps_malloc(asset->bytes,MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);
    if(!data) {ESP_LOGW(TAG,"PSRAM cache unavailable for %s",asset->remote);return false;}
    FILE *file=fopen(asset->path,"rb");
    if(!file) {free(data);return false;}
    size_t copied=0;uint32_t crc=0;
    while(copied<asset->bytes) {
        size_t wanted=asset->bytes-copied;if(wanted>capacity) wanted=capacity;
        size_t n=fread(buffer,1,wanted,file);
        if(n!=wanted) break;
        memcpy(data+copied,buffer,n);crc=crc_update(crc,buffer,n);copied+=n;
        vTaskDelay(1);
    }
    fclose(file);
    if(copied!=asset->bytes || crc!=asset->crc) {free(data);return false;}
    cached_data[index]=data;
    ESP_LOGI(TAG,"PSRAM cached %s: %u verified bytes",asset->remote,(unsigned)copied);
    return true;
}

static uint32_t crc_update(uint32_t crc,const uint8_t *data,size_t count)
{
    crc=~crc;
    for(size_t i=0;i<count;i++) crc=crc_table[(crc^data[i])&255]^(crc>>8);
    return ~crc;
}

static bool valid_cached(const media_asset_t *asset,uint8_t *buffer,size_t capacity)
{
    struct stat s;
    if(stat(asset->path,&s)!=0 || s.st_size!=asset->bytes) return false;
    FILE *file=fopen(asset->path,"rb");
    if(!file) return false;
    uint32_t crc=0; size_t total=0,n;
    while((n=fread(buffer,1,capacity,file))>0) {
        crc=crc_update(crc,buffer,n); total+=n; vTaskDelay(1);
    }
    bool valid=!ferror(file) && total==asset->bytes && crc==asset->crc;
    fclose(file);
    return valid;
}

static bool download(const media_asset_t *asset,uint8_t *buffer,size_t capacity)
{
    /* Use the same configured Hub origin. No credentials or arbitrary URL is
     * accepted from a web page, and redirects are disabled. */
    const char *ws=MONITOR_HUB_WS_URL;
    if(strncmp(ws,"ws://",5)!=0) return false;
    const char *end=strchr(ws+5,'/');
    int authority=end?(int)(end-(ws+5)):(int)strlen(ws+5);
    char url[256],part[64];
    int length=snprintf(url,sizeof(url),"http://%.*s/motion-assets/%s",authority,ws+5,asset->remote);
    if(length<0 || length>=sizeof(url)) return false;
    snprintf(part,sizeof(part),"%s.part",asset->path);
    esp_http_client_config_t config={.url=url,.timeout_ms=8000,.buffer_size=4096,.disable_auto_redirect=true};
    esp_http_client_handle_t client=esp_http_client_init(&config);
    if(!client) return false;
    bool ok=false; FILE *file=NULL; size_t total=0; uint32_t crc=0;
    if(esp_http_client_open(client,0)!=ESP_OK) goto done;
    int64_t content_length=esp_http_client_fetch_headers(client);
    if(esp_http_client_get_status_code(client)!=200 || content_length!=asset->bytes) goto done;
    file=fopen(part,"wb");
    if(!file) goto done;
    while(total<asset->bytes) {
        size_t wanted=asset->bytes-total; if(wanted>capacity) wanted=capacity;
        size_t filled=0;
        /* TCP fragments must not become tiny FAT writes. Fill one aligned
         * block first, then commit it once to the card. */
        while(filled<wanted) {
            int n=esp_http_client_read(client,(char *)buffer+filled,(int)(wanted-filled));
            if(n<=0) goto done;
            filled+=(size_t)n;
        }
        if(fwrite(buffer,1,filled,file)!=filled) goto done;
        crc=crc_update(crc,buffer,filled); total+=filled;
        vTaskDelay(1);
    }
    ok=crc==asset->crc;
done:
    if(file && fclose(file)!=0) ok=false;
    esp_http_client_cleanup(client);
    if(ok) {
        /* Replace only the two reserved generated-cache names. */
        unlink(asset->path);
        ok=rename(part,asset->path)==0;
    }
    if(!ok) unlink(part);
    ESP_LOGI(TAG,"%s %s: %u bytes CRC32=%08lx",asset->remote,ok?"verified":"not ready",(unsigned)total,(unsigned long)crc);
    return ok;
}

static void sync_task(void *arg)
{
    (void)arg;
    for(unsigned i=0;i<256;i++) {
        uint32_t c=i;
        for(int bit=0;bit<8;bit++) c=(c&1)?0xedb88320u^(c>>1):c>>1;
        crc_table[i]=c;
    }
    size_t capacity=32768;
    uint8_t *buffer=malloc(capacity);
    if(!buffer) {capacity=8192;buffer=malloc(capacity);}
    bool ok=buffer!=NULL;
    for(int i=0;i<2 && ok;i++) ok=valid_cached(&media_assets[i],buffer,capacity) || download(&media_assets[i],buffer,capacity);
    for(int i=0;i<2 && ok;i++) ok=cache_in_psram(i,buffer,capacity);
    free(buffer);
    ready=ok; busy=false;
    ESP_LOGI(TAG,"CRT media cache %s",ok?"ready":"pending; legacy video retained");
    vTaskDelete(NULL);
}

void media_assets_sync(bool online,bool storage_mounted)
{
    if(!online || !storage_mounted || ready || busy) return;
    int64_t now=esp_timer_get_time();
    if(last_attempt_us && now-last_attempt_us<60000000LL) return;
    last_attempt_us=now; busy=true;
    if(xTaskCreate(sync_task,"media-sync",6144,NULL,1,NULL)!=pdPASS) busy=false;
}

bool media_assets_ready(void) { return ready; }
bool media_assets_busy(void) { return busy; }
const uint8_t *media_assets_data(unsigned index) { return ready && index<2?cached_data[index]:NULL; }
