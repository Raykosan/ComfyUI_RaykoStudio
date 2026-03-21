import { app } from "../../scripts/app.js";

// ==================== КОНФИГУРАЦИЯ ====================
const NODE_TYPE = "RS_TextOverlay";
const NODE_WIDTH = 350;
const NODE_HEIGHT = 750;
const COLOR_INPUTS = ['text_color', 'outline_color', 'shadow_color'];
// =====================================================

app.registerExtension({
    name: "RaykoStudio.TextOverlay",
    
    async init() {
        const style = document.createElement('style');
        style.textContent = `
            /* Исправление чёрного текста на чёрном фоне */
            .litegraph .litemenu-entry.color_widget input[type="text"] {
                color: #ffffff !important;
                text-shadow: 0 0 2px #000000, 0 0 4px #000000;
            }
            
            /* Цветная полоса виджета */
            .litegraph .litemenu-entry.color_widget .color_preview {
                border: 1px solid #ffffff;
                box-shadow: 0 0 3px rgba(0,0,0,0.5);
            }
            
            /* Улучшенная читаемость для тёмных цветов */
            .litegraph .litemenu-entry input[type="text"][value="#000000"],
            .litegraph .litemenu-entry input[type="text"][value="#000"] {
                color: #ffffff !important;
                background: #333333 !important;
            }
            
            /* Общий стиль для всех COLOR виджетов ноды */
            .node.RS_TextOverlay .widget_color input {
                color: #ffffff !important;
                text-shadow: 0 0 2px #000000;
                font-weight: 500;
            }
            
            /* Стили для светлых цветов */
            .litegraph .litemenu-entry input[type="text"][value="#FFFFFF"],
            .litegraph .litemenu-entry input[type="text"][value="#FFF"] {
                color: #000000 !important;
                text-shadow: none;
            }
        `;
        document.head.appendChild(style);
        console.log("🦊 Color widget styles applied");
    },
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== NODE_TYPE) return;
        
        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        
        nodeType.prototype.onNodeCreated = function() {
            const result = origOnNodeCreated?.apply(this, arguments);
            
            // 📐 Устанавливаем ширину ноды 400px
            this.size = [NODE_WIDTH, NODE_HEIGHT];
            this.setSize([NODE_WIDTH, this.size[1]]);
                        
            // 🎨 Настраиваем COLOR виджеты для лучшей читаемости
            if (this.widgets) {
                this.widgets.forEach((widget) => {
                    if (COLOR_INPUTS.includes(widget.name)) {
                        // Сохраняем оригинальный callback
                        const origCallback = widget.callback;
                        
                        // Переопределяем callback для обновления стилей
                        widget.callback = function(value) {
                            const result = origCallback?.apply(this, arguments);
                            
                            // Обновляем стиль в зависимости от цвета
                            if (widget.element) {
                                const brightness = getColorBrightness(value);
                                widget.element.style.color = brightness < 0.5 ? '#ffffff' : '#000000';
                                widget.element.style.textShadow = brightness < 0.5 
                                    ? '0 0 2px #000000, 0 0 4px #000000' 
                                    : 'none';
                            }
                            
                            return result;
                        };
                        
                        // Применяем стили сразу при создании
                        setTimeout(() => {
                            if (widget.element && widget.value) {
                                const brightness = getColorBrightness(widget.value);
                                widget.element.style.color = brightness < 0.5 ? '#ffffff' : '#000000';
                                widget.element.style.textShadow = brightness < 0.5 
                                    ? '0 0 2px #000000, 0 0 4px #000000' 
                                    : 'none';
                            }
                        }, 100);
                    }
                });
            }
            
            this.setProperty("rs_text_overlay_version", "3.9");
            this.setProperty("node_width", NODE_WIDTH);
            
            return result;
        };
    },
    
    async loadedGraphNode(node, app) {
        if (node.type !== NODE_TYPE) return;
        
        // 📐 Убеждаемся, что ширина установлена правильно
        if (node.size[0] < NODE_WIDTH) {
            node.setSize([NODE_WIDTH, node.size[1]]);
        }
    }
});

// 🎨 Утилита для определения яркости цвета
function getColorBrightness(color) {
    if (!color) return 1.0;
    
    let r, g, b;
    
    if (Array.isArray(color)) {
        // [R, G, B, A] формат (0-1)
        r = color[0] || 0;
        g = color[1] || 0;
        b = color[2] || 0;
    } else if (typeof color === 'string') {
        // HEX формат
        const hex = color.replace('#', '');
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16) / 255;
            g = parseInt(hex[1] + hex[1], 16) / 255;
            b = parseInt(hex[2] + hex[2], 16) / 255;
        } else if (hex.length >= 6) {
            r = parseInt(hex.substring(0, 2), 16) / 255;
            g = parseInt(hex.substring(2, 4), 16) / 255;
            b = parseInt(hex.substring(4, 6), 16) / 255;
        } else {
            return 1.0;
        }
    } else {
        return 1.0;
    }
    
    // Формула яркости (ITU-R BT.709)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

console.log(`🦊 RS Text Overlay UI Extension registered for ${NODE_TYPE} (${NODE_WIDTH}px)`);