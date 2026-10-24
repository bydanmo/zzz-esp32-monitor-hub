#include "dashboard.h"

#include "ui/ui_shell.h"

void dashboard_create(void)
{
    ui_shell_create();
}

void dashboard_update(const ui_model_t *model)
{
    ui_shell_update(model);
}

void dashboard_apply_config(const monitor_display_config_t *config)
{
    ui_shell_apply_config(config);
}
