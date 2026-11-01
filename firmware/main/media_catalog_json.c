#include "media_catalog.h"
#include "cJSON.h"
#include <math.h>
#include <string.h>

static bool number(const cJSON *object,const char *key,uint32_t *out)
{
    const cJSON *value=cJSON_GetObjectItemCaseSensitive(object,key);
    if(!cJSON_IsNumber(value)||!isfinite(value->valuedouble)||value->valuedouble<0||
       value->valuedouble>UINT32_MAX||floor(value->valuedouble)!=value->valuedouble)return false;
    *out=(uint32_t)value->valuedouble;return true;
}
static bool string(const cJSON *object,const char *key,char *out,size_t size)
{
    const cJSON *value=cJSON_GetObjectItemCaseSensitive(object,key);
    if(!cJSON_IsString(value)||!value->valuestring||strlen(value->valuestring)>=size)return false;
    strcpy(out,value->valuestring);return true;
}
bool media_catalog_decode(const char *json,media_clip_t *clips,unsigned *out_count,uint32_t *out_background_crc)
{
    if(!json||!clips||!out_count||!out_background_crc)return false;
    cJSON *root=cJSON_Parse(json);if(!root)return false;
    uint32_t version=0,revision=0,bytes=0,crc=0;char remote[96];bool valid=false;
    const cJSON *array=cJSON_GetObjectItemCaseSensitive(root,"entries");
    const cJSON *background=cJSON_GetObjectItemCaseSensitive(root,"background");
    int count=cJSON_GetArraySize(array);
    if(!number(root,"schemaVersion",&version)||version!=1||!number(root,"revision",&revision)||
       !cJSON_IsArray(array)||count<1||count>MEDIA_CATALOG_MAX||!number(background,"bytes",&bytes)||bytes!=480*320*2||
       !number(background,"crc",&crc)||!string(background,"remote",remote,sizeof(remote))||strcmp(remote,"/api/animations/assets/background/frames")!=0)goto done;
    memset(clips,0,sizeof(*clips)*MEDIA_CATALOG_MAX);
    for(int i=0;i<count;i++) {
        const cJSON *entry=cJSON_GetArrayItem(array,i);media_clip_t *clip=&clips[i];uint32_t dimensions[5];
        if(!string(entry,"id",clip->id,sizeof(clip->id))||!string(entry,"label",clip->label,sizeof(clip->label))||
           !string(entry,"remote",clip->remote,sizeof(clip->remote))||!number(entry,"bytes",&clip->bytes)||!number(entry,"crc",&clip->crc))goto done;
        const char *keys[]={"width","height","x","y","fps"};
        for(int k=0;k<5;k++)if(!number(entry,keys[k],&dimensions[k])||dimensions[k]>480)goto done;
        clip->width=dimensions[0];clip->height=dimensions[1];clip->x=dimensions[2];clip->y=dimensions[3];clip->fps=dimensions[4];
        if(!media_clip_valid(clip)||media_catalog_find(clips,(unsigned)i,clip->id)>=0)goto done;
    }
    *out_count=(unsigned)count;*out_background_crc=crc;valid=true;
done:
    cJSON_Delete(root);return valid;
}
