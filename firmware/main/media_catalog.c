#include "media_catalog.h"
#include <stdio.h>
#include <string.h>

bool media_clip_valid(const media_clip_t *clip)
{
    if (!clip || !memchr(clip->id,0,sizeof(clip->id)) || !animation_id_valid(clip->id) ||
        !memchr(clip->label,0,sizeof(clip->label)) || !clip->label[0] || !memchr(clip->remote,0,sizeof(clip->remote))) return false;
    for(const char *c=clip->label;*c;c++) if(!((*c>='A'&&*c<='Z')||(*c>='a'&&*c<='z')||(*c>='0'&&*c<='9')||*c==' '||*c=='_'||*c=='-')) return false;
    if(clip->width!=198||clip->height!=150||clip->x!=145||clip->y!=82||clip->fps!=30 ||
       clip->bytes==0||clip->bytes>MEDIA_MAX_BYTES||clip->bytes%(198*150*2)!=0) return false;
    char expected[96];snprintf(expected,sizeof(expected),"/api/animations/assets/%s/frames",clip->id);
    return strcmp(clip->remote,expected)==0;
}
int media_catalog_find(const media_clip_t *clips,unsigned count,const char *id)
{
    if(!clips||!id||count>MEDIA_CATALOG_MAX) return -1;
    for(unsigned i=0;i<count;i++) if(strcmp(clips[i].id,id)==0) return (int)i;
    return -1;
}
int media_catalog_next(const media_clip_t *clips,unsigned count,const char *id)
{
    if(!clips||count==0||count>MEDIA_CATALOG_MAX) return -1;
    int index=media_catalog_find(clips,count,id);
    return index<0?0:(index+1)%(int)count;
}

int media_catalog_start(const media_clip_t *clips,unsigned count,const animation_preferences_t *preferences)
{
    if(!clips||!preferences||count==0||count>MEDIA_CATALOG_MAX)return -1;
    if(preferences->mode==ANIMATION_SEQUENCE)return 0;
    if(preferences->mode!=ANIMATION_SINGLE)return -1;
    int selected=media_catalog_find(clips,count,preferences->id);
    return selected<0?0:selected;
}

int media_catalog_session_start(const media_clip_t *clips,unsigned count,
                               const animation_preferences_t *preferences,const char *last_automatic_id)
{
    int first=media_catalog_start(clips,count,preferences);
    if(first<0 || preferences->mode!=ANIMATION_SEQUENCE)return first;
    return media_catalog_next(clips,count,last_automatic_id?last_automatic_id:"");
}
