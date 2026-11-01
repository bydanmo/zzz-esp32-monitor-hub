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

/* The generated pair remains the bootstrap/offline default, never edited by uploads. */
#include "media_assets.generated.h"
static const char *TAG="media-assets";
static portMUX_TYPE lock=portMUX_INITIALIZER_UNLOCKED;
static _Atomic bool busy,pending;
static bool initialized,preview_pending,worker_online,worker_fetch,tried_disk_catalog;
static bool worker_prefetch,on_card[MEDIA_CATALOG_MAX];
static int64_t cache_retry_us[MEDIA_CATALOG_MAX];
static int64_t last_attempt_us,last_catalog_us;
static uint32_t crc_table[256];
static uint8_t *cached_data[2];
static size_t cache_capacity;
static media_asset_t current_assets[2];
static char current_paths[2][64],current_remotes[2][96];
static media_clip_t clips[MEDIA_CATALOG_MAX],incoming[MEDIA_CATALOG_MAX];
static unsigned clip_count;
static uint32_t background_crc;
static char background_remote[96];
static media_library_snapshot_t view;
static char last_automatic_id[ANIMATION_ID_BYTES];

static void status(media_status_t next,uint32_t received,uint32_t total)
{
    portENTER_CRITICAL(&lock);view.status=next;view.received=received;view.total=total;portEXIT_CRITICAL(&lock);
}
static uint32_t crc_update(uint32_t crc,const uint8_t *data,size_t count)
{
    crc=~crc;for(size_t i=0;i<count;i++) crc=crc_table[(crc^data[i])&255]^(crc>>8);return ~crc;
}
static void yield_io(unsigned *budget,size_t bytes)
{
    *budget+=(unsigned)bytes;
    if(*budget>=512*1024){*budget=0;vTaskDelay(1);}
}
void media_assets_init(void)
{
    if(initialized) return;
    for(unsigned i=0;i<256;i++) {uint32_t c=i;for(int bit=0;bit<8;bit++) c=(c&1)?0xedb88320u^(c>>1):c>>1;crc_table[i]=c;}
    clips[0]=(media_clip_t){.id="builtin",.label="ORIGINAL",.width=198,.height=150,.x=145,.y=82,.fps=30,
                           .bytes=media_assets[0].bytes,.crc=media_assets[0].crc};
    snprintf(clips[0].remote,sizeof(clips[0].remote),"/motion-assets/%s",media_assets[0].remote);
    clip_count=1;background_crc=media_assets[1].crc;
    snprintf(background_remote,sizeof(background_remote),"/motion-assets/%s",media_assets[1].remote);
    snprintf(view.requested_id,sizeof(view.requested_id),"%s",animation_preferences_get()->id);
    initialized=true;pending=true;
}
void media_assets_snapshot(media_library_snapshot_t *snapshot)
{
    if(!snapshot) return;
    portENTER_CRITICAL(&lock);
    *snapshot=view;snapshot->count=clip_count;snapshot->busy=busy;
    snapshot->cached_count=0;
    for(unsigned i=0;i<clip_count;i++) {
        memcpy(snapshot->entries[i].id,clips[i].id,17);memcpy(snapshot->entries[i].label,clips[i].label,17);
        snapshot->entries[i].cached=on_card[i];if(on_card[i])snapshot->cached_count++;
    }
    portEXIT_CRITICAL(&lock);
}
bool media_assets_request(const char *id,bool preview)
{
    if(!animation_id_valid(id)) return false;
    bool ok=false;
    portENTER_CRITICAL(&lock);
    if(media_catalog_find(clips,clip_count,id)>=0) {
        if(preview || strcmp(view.requested_id,id)!=0 || strcmp(view.loaded_id,id)!=0 || view.status==MEDIA_FAILED) pending=true;
        snprintf(view.requested_id,sizeof(view.requested_id),"%s",id);
        preview_pending=preview;ok=true;
    }
    portEXIT_CRITICAL(&lock);return ok;
}
void media_assets_prepare_selected(void)
{
    char target[17]={0};const animation_preferences_t *preferred=animation_preferences_get();
    portENTER_CRITICAL(&lock);
    if(preview_pending){portEXIT_CRITICAL(&lock);return;}
    int index=media_catalog_session_start(clips,clip_count,preferred,last_automatic_id);
    if(index>=0)memcpy(target,clips[index].id,17);
    bool already_requested=strcmp(view.requested_id,target)==0;
    portEXIT_CRITICAL(&lock);
    if(target[0]&&!already_requested)media_assets_request(target,false);
}

bool media_assets_ready(void)
{
    bool ready;
    portENTER_CRITICAL(&lock);ready=!busy && view.loaded_id[0] && strcmp(view.loaded_id,view.requested_id)==0 && cached_data[0] && cached_data[1];portEXIT_CRITICAL(&lock);
    return ready;
}
bool media_assets_busy(void) { return busy; }
const uint8_t *media_assets_data(unsigned index) { return index<2?cached_data[index]:NULL; }
const media_asset_t *media_assets_current(unsigned index) { return index<2?&current_assets[index]:NULL; }
bool media_assets_take_preview(void)
{
    if(!media_assets_ready()) return false;
    portENTER_CRITICAL(&lock);bool wanted=preview_pending;preview_pending=false;portEXIT_CRITICAL(&lock);return wanted;
}
void media_assets_cancel_preview(void)
{
    portENTER_CRITICAL(&lock);preview_pending=false;portEXIT_CRITICAL(&lock);
}
void media_assets_session_started(void)
{
    if(!media_assets_ready())return;
    char played[ANIMATION_ID_BYTES];
    portENTER_CRITICAL(&lock);
    memcpy(played,view.loaded_id,sizeof(played));
    if(animation_preferences_get()->mode==ANIMATION_SEQUENCE)memcpy(last_automatic_id,played,sizeof(last_automatic_id));
    portEXIT_CRITICAL(&lock);
    ESP_LOGI(TAG,"Screensaver session clip %s; repeat one clip for this five-minute phase",played);
}

static bool parse_catalog(const char *json)
{
    unsigned count=0;uint32_t crc=0;
    if(!media_catalog_decode(json,incoming,&count,&crc))return false;
    bool cached[MEDIA_CATALOG_MAX]={0};int64_t retries[MEDIA_CATALOG_MAX]={0};
    portENTER_CRITICAL(&lock);
    for(unsigned i=0;i<count;i++) {
        int old=media_catalog_find(clips,clip_count,incoming[i].id);
        if(old>=0&&clips[old].crc==incoming[i].crc&&clips[old].bytes==incoming[i].bytes){cached[i]=on_card[old];retries[i]=cache_retry_us[old];}
    }
    memcpy(clips,incoming,sizeof(clips));memcpy(on_card,cached,sizeof(on_card));memcpy(cache_retry_us,retries,sizeof(cache_retry_us));
    clip_count=count;background_crc=crc;strcpy(background_remote,"/api/animations/assets/background/frames");
    if(media_catalog_find(clips,clip_count,view.requested_id)<0) memcpy(view.requested_id,clips[0].id,17);
    portEXIT_CRITICAL(&lock);return true;
}
static esp_http_client_handle_t open_http(const char *remote)
{
    const char *ws=MONITOR_HUB_WS_URL;
    if(strncmp(ws,"ws://",5)!=0 || remote[0]!='/' || strstr(remote,"..") || strchr(remote,'?') || strchr(remote,'#')) return NULL;
    const char *end=strchr(ws+5,'/');int authority=end?(int)(end-(ws+5)):(int)strlen(ws+5);
    char url[256];int length=snprintf(url,sizeof(url),"http://%.*s%s",authority,ws+5,remote);
    if(length<0||length>=sizeof(url)) return NULL;
    esp_http_client_config_t config={.url=url,.timeout_ms=8000,.buffer_size=strcmp(remote,"/api/animations/device")==0?1024:4096,.disable_auto_redirect=true};
    return esp_http_client_init(&config);
}
static void catalog_from_card(void)
{
    if(tried_disk_catalog) return;
    tried_disk_catalog=true;
    FILE *file=fopen("/sdcard/animcat.json","rb");if(!file) return;
    char *data=heap_caps_malloc(8193,MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);if(!data){fclose(file);return;}
    size_t bytes=fread(data,1,8193,file);fclose(file);
    if(bytes>0&&bytes<=8192) {data[bytes]=0;parse_catalog(data);}
    free(data);
}
static void catalog_from_hub(void)
{
    esp_http_client_handle_t client=open_http("/api/animations/device");if(!client){ESP_LOGW(TAG,"Catalog client allocation failed");return;}
    char *data=heap_caps_malloc(8193,MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);size_t bytes=0;bool valid=false;
    const char *stage="allocation";int code=0;int64_t length=-1;bool chunked=false;
    if(!data)goto done;
    stage="connect";if(esp_http_client_open(client,0)!=ESP_OK)goto done;
    stage="headers";length=esp_http_client_fetch_headers(client);code=esp_http_client_get_status_code(client);
    chunked=esp_http_client_is_chunked_response(client);
    if(code!=200||length>8192||length<0)goto done;
    stage="body";
    while(bytes<8192) {
        size_t wanted=8192-bytes;
        if(!chunked&&length>0){if(bytes==(size_t)length)break;if(wanted>(size_t)length-bytes)wanted=(size_t)length-bytes;}
        int read=esp_http_client_read(client,data+bytes,(int)wanted);
        if(read<0) goto done;
        if(read==0) break;
        bytes+=(size_t)read;
    }
    if(!chunked&&length>0&&(size_t)length!=bytes) goto done;
    if(!esp_http_client_is_complete_data_received(client))goto done;
    if(bytes==0||bytes==8192) goto done;
    data[bytes]=0;stage="decode";valid=parse_catalog(data);
    if(valid) {
        ESP_LOGI(TAG,"Catalog ready: %u entries, %u bytes",clip_count,(unsigned)bytes);
        FILE *file=fopen("/sdcard/animcat.part","wb");
        if(file) {bool saved=fwrite(data,1,bytes,file)==bytes;if(fclose(file)!=0)saved=false;
            if(saved){unlink("/sdcard/animcat.json");rename("/sdcard/animcat.part","/sdcard/animcat.json");}}
    }
done:
    if(!valid) ESP_LOGW(TAG,"Catalog unavailable at %s: HTTP %d, expected %lld, read %u, internal largest %u; retaining entries",stage,code,(long long)length,(unsigned)bytes,(unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL|MALLOC_CAP_8BIT));
    free(data);esp_http_client_cleanup(client);
}
static bool download(const media_asset_t *asset,uint8_t *buffer,size_t capacity,bool prefetch)
{
    esp_http_client_handle_t client=open_http(asset->remote);if(!client)return false;
    char part[72];snprintf(part,sizeof(part),"%s.part",asset->path);
    bool ok=false,deferred=false;FILE *file=NULL;size_t total=0;uint32_t crc=0;unsigned blocks=0;
    if(esp_http_client_open(client,0)!=ESP_OK)goto done;
    int64_t length=esp_http_client_fetch_headers(client);
    if(esp_http_client_get_status_code(client)!=200||length!=asset->bytes)goto done;
    file=fopen(part,"wb");if(!file)goto done;
    status(MEDIA_DOWNLOADING,0,asset->bytes);
    while(total<asset->bytes) {
        if(prefetch&&pending){deferred=true;goto done;}
        size_t wanted=asset->bytes-total;if(wanted>capacity)wanted=capacity;size_t filled=0;
        while(filled<wanted){int n=esp_http_client_read(client,(char *)buffer+filled,(int)(wanted-filled));if(n<=0)goto done;filled+=(size_t)n;}
        if(fwrite(buffer,1,filled,file)!=filled)goto done;
        crc=crc_update(crc,buffer,filled);total+=filled;status(MEDIA_DOWNLOADING,total,asset->bytes);yield_io(&blocks,filled);
    }
    ok=crc==asset->crc;
done:
    if(file&&fclose(file)!=0)ok=false;
    esp_http_client_cleanup(client);
    if(ok){unlink(asset->path);ok=rename(part,asset->path)==0;}
    if(!ok)unlink(part);
    ESP_LOGI(TAG,"%s %s: %u bytes CRC32=%08lx",asset->remote,ok?"verified":deferred?"deferred":"not ready",(unsigned)total,(unsigned long)crc);
    return ok;
}
static void clip_path(const char *id,char *path,size_t size)
{
    if(strcmp(id,"builtin")==0)snprintf(path,size,"/sdcard/zzz_crt.raw");
    else snprintf(path,size,"/sdcard/a%s.raw",id);
}
static int next_uncached(int64_t now)
{
    for(unsigned i=0;i<clip_count;i++)if(!on_card[i]&&now>=cache_retry_us[i])return (int)i;
    return -1;
}
static bool verify_file(const media_asset_t *asset,uint8_t *buffer,size_t capacity)
{
    struct stat info;if(stat(asset->path,&info)!=0||(size_t)info.st_size!=asset->bytes)return false;
    FILE *file=fopen(asset->path,"rb");if(!file)return false;
    size_t read_bytes=0;uint32_t crc=0;unsigned blocks=0;
    status(MEDIA_CHECKING,0,asset->bytes);
    while(read_bytes<asset->bytes) {
        if(pending)break;
        size_t wanted=asset->bytes-read_bytes;if(wanted>capacity)wanted=capacity;
        size_t n=fread(buffer,1,wanted,file);if(n!=wanted)break;
        crc=crc_update(crc,buffer,n);read_bytes+=n;status(MEDIA_CHECKING,read_bytes,asset->bytes);
        yield_io(&blocks,n);
    }
    fclose(file);return read_bytes==asset->bytes&&crc==asset->crc;
}
static void prefetch_one(uint8_t *buffer,size_t capacity)
{
    media_clip_t clip={0};int index;
    portENTER_CRITICAL(&lock);
    index=next_uncached(esp_timer_get_time());
    if(index>=0){clip=clips[index];view.prefetching=true;memcpy(view.transfer_label,clip.label,17);}
    portEXIT_CRITICAL(&lock);
    if(index<0)return;
    char path[64];clip_path(clip.id,path,sizeof(path));
    media_asset_t asset={path,clip.remote,clip.width,clip.height,clip.x,clip.y,clip.fps,clip.bytes,clip.crc};
    bool reused=verify_file(&asset,buffer,capacity),ok=reused;
    if(!ok&&!pending&&worker_online)ok=download(&asset,buffer,capacity,true);
    portENTER_CRITICAL(&lock);
    on_card[index]=ok;cache_retry_us[index]=ok||pending?0:esp_timer_get_time()+30000000LL;
    view.prefetching=false;view.prefetch_error=!ok&&!pending&&worker_online;
    portEXIT_CRITICAL(&lock);
    if(ok)ESP_LOGI(TAG,"TF cache %s: %s (%u bytes); current PSRAM clip unchanged",reused?"reused":"stored",clip.label,(unsigned)clip.bytes);
}
static bool load_psram(unsigned index,const media_asset_t *asset,uint8_t *buffer,size_t capacity)
{
    if(index==0&&cache_capacity<asset->bytes){free(cached_data[0]);cached_data[0]=NULL;cache_capacity=0;}
    if(!cached_data[index]) {
        cached_data[index]=heap_caps_malloc(asset->bytes,MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);
        if(!cached_data[index])return false;
        if(index==0)cache_capacity=asset->bytes;
    }
    FILE *file=fopen(asset->path,"rb");if(!file)return false;
    size_t copied=0;uint32_t crc=0;unsigned blocks=0;status(MEDIA_LOADING,0,asset->bytes);
    while(copied<asset->bytes){size_t wanted=asset->bytes-copied;if(wanted>capacity)wanted=capacity;
        size_t n=fread(buffer,1,wanted,file);if(n!=wanted)break;
        memcpy(cached_data[index]+copied,buffer,n);crc=crc_update(crc,buffer,n);copied+=n;yield_io(&blocks,n);}
    fclose(file);return copied==asset->bytes&&crc==asset->crc;
}
static void sync_task(void *arg)
{
    (void)arg;catalog_from_card();if(worker_fetch)catalog_from_hub();
    char id[17],remote[2][96],paths[2][64];media_clip_t clip={0};uint32_t bg_crc;
    portENTER_CRITICAL(&lock);
    int index=media_catalog_find(clips,clip_count,view.requested_id);
    if(index<0)index=0;
    clip=clips[index];memcpy(id,clip.id,17);strcpy(remote[0],clip.remote);strcpy(remote[1],background_remote);bg_crc=background_crc;
    bool keep_background=view.loaded_id[0]&&cached_data[1]&&current_assets[1].crc==bg_crc;
    bool unchanged=strcmp(view.loaded_id,id)==0&&current_assets[0].crc==clip.crc&&keep_background;
    portEXIT_CRITICAL(&lock);
    if(unchanged&&cached_data[0]&&cached_data[1]&&!worker_prefetch) {status(MEDIA_READY,0,0);busy=false;vTaskDelete(NULL);return;}
    /* Non-DMA PSRAM destinations make SDMMC fall back to single-sector I/O.
     * A small internal DMA window keeps bulk reads without starving HTTP/SD. */
    size_t capacity=8192;
    uint8_t *buffer=heap_caps_malloc(capacity,MALLOC_CAP_DMA|MALLOC_CAP_INTERNAL|MALLOC_CAP_8BIT);
    bool dma=buffer!=NULL;
    if(!buffer){capacity=4096;buffer=heap_caps_malloc(capacity,MALLOC_CAP_DMA|MALLOC_CAP_INTERNAL|MALLOC_CAP_8BIT);dma=buffer!=NULL;}
    if(!buffer){capacity=32768;buffer=heap_caps_malloc(capacity,MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT);}
    if(!buffer){capacity=4096;buffer=malloc(capacity);}
    ESP_LOGI(TAG,"Media IO buffer: %u bytes %s",buffer?(unsigned)capacity:0,dma?"internal DMA":"fallback");
    if(unchanged&&cached_data[0]&&cached_data[1]) {
        if(buffer&&!pending)prefetch_one(buffer,capacity);
        free(buffer);status(MEDIA_READY,0,0);busy=false;vTaskDelete(NULL);return;
    }
    portENTER_CRITICAL(&lock);view.prefetching=false;memcpy(view.transfer_label,clip.label,17);portEXIT_CRITICAL(&lock);
    clip_path(id,paths[0],sizeof(paths[0]));
    snprintf(paths[1],sizeof(paths[1]),"/sdcard/zzz_bg.raw");
    media_asset_t assets[2]={
        {paths[0],remote[0],clip.width,clip.height,clip.x,clip.y,clip.fps,clip.bytes,clip.crc},
        {paths[1],remote[1],480,320,0,0,1,480*320*2,bg_crc}};
    bool ok=buffer!=NULL;
    /* Load and verify in one card pass. Yield every 512KB, not every 32KB:
     * a tick is 10ms on this target and per-block delays would freeze each cut. */
    for(int pass=0;pass<2&&ok;pass++) {
        unsigned i=pass==0?1u:0u;
        if(i==1&&keep_background)continue;
        struct stat file_status;
        bool candidate=stat(assets[i].path,&file_status)==0&&(size_t)file_status.st_size==assets[i].bytes;
        bool loaded=candidate&&load_psram(i,&assets[i],buffer,capacity);
        if(!loaded&&worker_online&&download(&assets[i],buffer,capacity,false))loaded=load_psram(i,&assets[i],buffer,capacity);
        ok=loaded;
    }
    free(buffer);
    portENTER_CRITICAL(&lock);
    if(ok){for(int i=0;i<2;i++){strcpy(current_paths[i],paths[i]);strcpy(current_remotes[i],remote[i]);current_assets[i]=assets[i];current_assets[i].path=current_paths[i];current_assets[i].remote=current_remotes[i];}memcpy(view.loaded_id,id,17);view.status=MEDIA_READY;on_card[index]=true;}
    else {view.loaded_id[0]=0;view.status=MEDIA_FAILED;on_card[index]=false;}
    portEXIT_CRITICAL(&lock);
    ESP_LOGI(TAG,"Animation %s %s; only current clip cached in PSRAM",id,ok?"ready":"unavailable");
    if(!ok)ESP_LOGW(TAG,"Media heap: internal largest=%u, PSRAM largest=%u",
                   (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL|MALLOC_CAP_8BIT),
                   (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_SPIRAM|MALLOC_CAP_8BIT));
    busy=false;vTaskDelete(NULL);
}
void media_assets_sync(bool online,bool storage_mounted,bool allow_prefetch)
{
    if(!initialized)media_assets_init();
    portENTER_CRITICAL(&lock);view.online=online;view.storage=storage_mounted;portEXIT_CRITICAL(&lock);
    if(!storage_mounted||busy)return;
    int64_t now=esp_timer_get_time();
    portENTER_CRITICAL(&lock);
    bool foreground_ready=view.loaded_id[0]&&strcmp(view.loaded_id,view.requested_id)==0&&cached_data[0]&&cached_data[1];
    bool preview_ready=preview_pending&&foreground_ready;
    bool prefetch=allow_prefetch&&!preview_pending&&foreground_ready&&next_uncached(now)>=0;
    bool fetch=online&&!preview_pending&&(!last_catalog_us||now-last_catalog_us>=30000000LL);
    portEXIT_CRITICAL(&lock);
    if(preview_ready)return;
    if(!pending&&!fetch&&!prefetch&&last_attempt_us&&now-last_attempt_us<30000000LL)return;
    last_attempt_us=now;worker_online=online;worker_fetch=fetch;worker_prefetch=prefetch&&!pending;
    if(fetch)last_catalog_us=now;
    pending=false;busy=true;
    if(xTaskCreate(sync_task,"animation-sync",8192,NULL,1,NULL)!=pdPASS){busy=false;status(MEDIA_FAILED,0,0);}
}
