# 🦊 ComfyUI_RaykoStudio  
Set of custom nodes for ComfyUI providing additional image processing capabilities  
---  
Nodes do not require the installation of additional Python packages.  
Performance has been tested for:  
- ComfyUI 0.15*-0.17*  
- Python 3.10-3.13  
- Torch 2.8-2.10 
- Cuda 12.4-13.0  
---  
### 🛠 Installation  
Set of nodes can be installed in several ways:  
- Clone repository to `ComfyUI/custom_nodes/` folder:  
```
git clone https://github.com/Raykosan/ComfyUI_RaykoStudio.git  
```
- Copy ComfyUI_RaykoStudio folder to: ComfyUI/custom_nodes/  
- You can install this node using the ComfyUI_Manager   

---
---

# 🦊 RS Spline Mask node  
**Node for creating a spline mask** 

![Screenshot_1](https://github.com/user-attachments/assets/33544b90-d83c-4b9a-90e8-f94207aff158)

### 🔥 Features  
The node is designed to create masks without using the ComfyUI native editor. More accurate selection based on the principle of the Lasso tool from Photoshop.  

### 🪛 Usage  
The node is ready to use immediately after adding it. You can scale the node to a convenient size to more accurately place spline points. Incorrectly placed dots can be deleted by right-clicking on them. To remove all points from the preview area, click the "❌ Clear Points" button. For convenience, a green frame has been made that shows the area where you can put dots. The frame is slightly larger than the preview size so that the dots can be placed outside the preview, which guarantees that the mask completely covers the edge of the image.  

Link to the video: https://youtu.be/AqNLmLzSunU

---
---

# 🦊 RS Intermediate Spline Mask node  
**An interactive node for creating intermediate spline masks** 

![Screenshot_6](https://github.com/user-attachments/assets/c97fb1b8-5b1e-4c6b-bd49-af155e6f4d91)

### 🔥 Features  
Node allows you to pause the workflow at the image processing stage, manually select the desired area and continue generation without completely restarting the process. More accurate selection based on the principle of the Lasso tool from Photoshop.  

### 🪛 Usage  
When this node is reached, pipeline execution is automatically suspended. A preview of the input image is displayed in the node's interface. The user can left-click to add polygon points and right-click or Ctrl-click to delete the last points.  
The ACCEPT button confirms the created mask, after which the node completes processing and transmits the data further according to the scheme. The CLEAR POINTS button clears all the drawn points for redrawing. It is important that after using this button, you do not need to press the Prompt Queue again, just draw a new mask and press ACCEPT. The CANCEL button completely interrupts the process and resets the node status.  

### ↔️ Inputs and Outputs:
The IMAGE input accepts an image from any previous node. The IMAGE output returns the original image unchanged. The MASK output returns a black and white mask where the white area corresponds to the drawn polygon.  

---
---

# 🦊 RS Models Loader node  
**Combined node for loading models**  

![Screenshot_1](https://github.com/user-attachments/assets/fdca35c0-6554-4cfd-9ddf-805aebbdb2cd)


### 🔥 Features  
The node combines the loaders of the Model, Clip,VAE and LoRA.
If you have downloaded a new LoRA, then you do not need to update the ComfyUI or the page - there is a button to update the LoRA list.  

Link to the video: https://youtu.be/LxhVk5C_oas  

---
---

# 🦊 RS Text Overlay node  
**Node allows you to overlay text on images using masks**  
*The node is in the process of feature improvements, but the stated functionality is already working*

![Screenshot_1](https://github.com/user-attachments/assets/96cdfb99-93fb-45d3-bb8a-f15db00bbb3f)


### 🔥 Features  
- **Automatic font size selection** — the text always fits perfectly into the mask area  
- **Text rotation by mask** — the text is automatically aligned to the angle of the mask  
- **Multiline text support** — automatic line splitting  
- **Vertical and horizontal text orientation**  
- **Adjusting the letter and line spacing**  
- **Text outline** — customizable thickness and color  
- **Shadow** — adjustable displacement, blurring and transparency  
- **Text color** — HEX format support (#RRGGBB or #RRGGBBAA)  
- **Text transparency** — independent of stroke and shadow  
- **Supersampling** — rendering text in increased resolution followed by compression for perfect smoothing  
- **Edge Smoothing** — additional smoothing of text edges  
- **High-quality interpolation** - Lanczos filter when zooming  
- **Caching** — fonts, colors, sizes, and rendered layers  
- **LRU cache** — automatic memory management  
- **Optimized outline rendering** — 8-direction algorithms  

### 🔤 Installing Fonts

Place the font files in the fonts folder (.ttf, .otf, .ttc)  
Restart ComfyUI  

### 🪛 Usage  
  
| Parameter          | Description                          | Range                 |
|--------------------|--------------------------------------|-----------------------|
| TEXT               | Text to display (supports multiline) |                       |
| FONT               | List of available fonts              |                       |
| TEXT COLOR         | Color text in HEX format             | #000000 - #FFFFFF     |
| OUTLINE THICK      | Outline thickness                    | 0-50                  |
| OUTLINE COLOR      | Outline color in HEX format          | #000000 - #FFFFFF     |
| ROTATE WITH MASK   | Rotate text by the angle of mask     | ON/OFF                |
| TEXT OPACITY       | Text transparency                    | #000000 - #FFFFFF     |
| LINE SPACING       | Line spacing                         | 0.5-3.0               |
| LETTER SPACING     | Letter spacing                       | -20 - +100            |
| ORIENTATION        | Text orientation                     | horizontal / vertical |
| ENABLE SHADOW      | Enable shadow                        | ON/OFF                |
| SHADOW COLOR       | Shadow color in HEX format           | #000000 - #FFFFFF     |
| SHADOW OFFSET X/Y  | Shifting the shadow                  | -50 - +50             |
| SHADOW BLUR        | Blurring the shadow                  | 0.0-1.0               |
| SHADOW OPACITY     | Shadow transparency                  | 0.0-1.0               |
| SUPERSAMPLING      | Enable supersampling                 | ON/OFF                |
| SUPERSAMPLE FACTOR | Magnification factor                 | 2-4                   |
| EDGE SMOOTHING     | Smoothing the edges                  | ON/OFF                |
 
---
---

# 🦊 RS Saturation node  
**Professional image saturation control with artifact and highlight protection.**  

<img width="1024" height="742" alt="134" src="https://github.com/user-attachments/assets/e4266ff4-29e7-44bb-b7c3-67a1a895ec56" />

### 🔥 Features  
- **Smooth adjustment** with 0.05 steps  
- **Smart boosting** without overexposure  
- **Artifact protection** even at extreme values  
- **Batch processing** optimized  

### 🪛 Usage  
![RS Safe Saturation](https://github.com/user-attachments/assets/a46ad5c2-2a79-4f2a-bd8f-1f4dcec5084b)

  
| Range      | Processing Type               | Use Case                    |
|------------|-------------------------------|-----------------------------|
| 0.0-0.9    | Toning/desaturation           | Gradual color removal       |
| 1.0-1.3    | Natural enhancement           | Recommended range           |
| 1.3-2.0    | Vibrant artistic effects      | Stylization                 |
| 2.0-3.0    | Maximum saturation            | Cinematic effects           |

### ⚙️ Technical Details  
 
Algorithm workflow:  
Luminance space conversion  
Non-linear adjustment:  
Values <1.0: Linear interpolation  
Values >1.0: Adaptive S-curve  
Auto highlight recovery  

--- 
---

# 🦊 RS Save Image node  
**Node for adding explanatory text to an image**  

![Screenshot_1](https://github.com/user-attachments/assets/db6d8553-6122-40c7-93c2-7deb596b98f1)

### 🔥 Features  
The node is used to save the image while preserving the workflow inside the image. You can add explanatory text to an image with a choice of background size, theme, font and its size. It is possible to add your own fonts (to the fonts folder). Use ttf and otf fonts.  
If the label is not needed, leave the text field blank and the image is saved as usual.  

---
---
	
# 🦊 RS Save Image Pair node  
**The node is used to save the original and final images in a single image, while maintaining the workflow within the image**  

![Screenshot_1](https://github.com/user-attachments/assets/c0ae91a2-dbc4-4e03-be4a-ad8fefeb6140)

### 🔥 Features  
The node is used to save the source and final images in a single image while maintaining the workflow within the image. You can add explanatory text to any image with a choice of background size, theme, font and size font. A reverse upscale from 1 to 0 is provided to reduce the saved image (if it is used as a sketch with a workflow inside).  
It is possible to add your own fonts (to the fonts folder). Use ttf and otf fonts.  
If the label is not needed, leave the text field blank and the image is saved as usual.  
The node is convenient for visual understanding of the workflow contained in the image.  

### 🪛 Usage  
It is better to choose horizontal saving for portraits, and vertical saving for landscapes.  
Themes:  
light - white background, black text.  
dark - black background, white text.  

---
---

# 🦊 RS Image-Text node  
**Node embeds any hidden text into the image that can be used later**  

![RS Image-Text ](https://github.com/user-attachments/assets/c8b119bb-c695-4500-8cc1-0a3c0d96e299)

### 🔥 Features  
The node writes any hidden text to any png and jpeg file (jpeg is converted to png). And outputs text from images recorded in this way. You can use it instead of a Load Image (without a mask) and transfer the recorded text to the promt node. It is useful if there is an image and a shortcut to it, but the image does not contain a workflow (often found on the site civitai.com).  

### 🪛 Usage  
Two modes:  
Write - writes text to the uploaded image and saves it to the output folder with the prefix you specified.  
Read - reads the text you wrote earlier in the uploaded image, sends the text and images further according to the scheme.  

Link to the video: https://youtu.be/1s26hUcVXX4  

---
---

## 🤝 Bug Reporting  

If you encounter an issue or find a bug:  

Check Issues section on GitHub, maybe problem is already known.  
If new problem, create new Issue describing:  

- ComfyUI and Python versions  
- Problem description and reproduction steps  
- Screenshots or error logs (if available)  

---

## 📜 License  

MIT License. Use node at your own risk without any warranties.  

---

## ❤️ Acknowledgments  

Thanks to ComfyUI community for inspiration and support! If you like this node, don't forget to star on GitHub!
