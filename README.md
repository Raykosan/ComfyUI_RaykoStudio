# 🦊 ComfyUI_RaykoStudio  
Set of custom nodes for ComfyUI providing additional image processing capabilities  
---  
Nodes do not require the installation of additional Python packages.  
Performance has been tested for:  
- ComfyUI 0.15*-0.18*  
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

![Screenshot_3](https://github.com/user-attachments/assets/91ff5f83-5f52-4983-a5e4-fe4f514f8d0a)

### 🔥 Features  
The node is designed to create masks without using the ComfyUI native editor. More accurate selection based on the principle of the Lasso tool from Photoshop.  

### 🪛 Usage  
The node is ready for use immediately after it is added. Images are added using the "🎨 IMAGE" (images from the input folder) and "🖼️ UPLOAD IMAGE" (images from any folder on your PC) buttons. You can scale the node to a convenient size to more accurately place the points of the spline. Incorrectly positioned points can be deleted by right-clicking on them. To remove all points from the preview area, click the "🔴 CLEAR POINTS" button.  

### ↔️ Inputs and Outputs:  
The IMAGE output returns the original image unchanged. The MASK output returns a black and white mask where the white area corresponds to the drawn polygon.

---
---

# 🦊 RS Intermediate Spline Mask node  
**An interactive node for creating intermediate spline masks** 

![Screenshot_6](https://github.com/user-attachments/assets/c97fb1b8-5b1e-4c6b-bd49-af155e6f4d91)

### 🔥 Features  
Node allows you to pause the workflow at the image processing stage, manually select the desired area and continue generation without completely restarting the process. More accurate selection based on the principle of the Lasso tool from Photoshop.  

### 🪛 Usage  
When this node is reached, pipeline execution is automatically suspended. A preview of the input image is displayed in the node's interface. The user can left-click to add polygon points and right-click or Ctrl-click to delete the last points.  
The "✔️ ACCEPT" button confirms the created mask, after which the node completes processing and transmits the data further according to the scheme. The "🔴 CLEAR POINTS" button clears all the drawn points for redrawing. It is important that after using this button, you do not need to press the Prompt Queue again, just draw a new mask and press "✔️ ACCEPT". The "❌ CANCEL" button completely interrupts the process and resets the node status.  

### ↔️ Inputs and Outputs:
The IMAGE input accepts an image from any previous node. The IMAGE output returns the original image unchanged. The MASK output returns a black and white mask where the white area corresponds to the drawn polygon.  

---
---

# 🦊 RS Image Selector node  
**Node for Interactive Batch Image Selection** 

![Screenshot_2](https://github.com/user-attachments/assets/af723d73-4ff6-458c-a267-f4ab195d7b72)

### 🔥 Features  
- **Interactive Grid View** - Display all batch images in a responsive grid layout  
- **Multi-Select Support** - Click to select/deselect individual images  
- **Smart Auto-Resize** - Node automatically adjusts size based on image count  
- **Heartbeat System** - Robust connection monitoring between frontend and backend  
- **Auto-Cleanup** - Proper resource cleanup on node removal or workflow close  

### 🪛 Usage  
**Buttons**  
➕ SELECT ALL - Select all images in batch  

⭕ DESELECT ALL - Clear all selections  
	
✔️ ACCEPT - Confirm selection and continue  
	
❌ CANCEL - Cancel and interrupt generation  

**Continue Workflow**  
Click "✔️ ACCEPT" to pass selected images to next nodes. Only selected images will be processed downstream  
		
### ⚠️ Reminder
**The generation process will pause indefinitely until you click "❌ CANCEL" or close the workflow or the ComfyUI page.**

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

![Screenshot_6](https://github.com/user-attachments/assets/d3943194-bd29-4f14-a964-20a25206022e)

### 🔥 Features  
- **Automatic font size selection** — the text always fits perfectly into the mask area  
- **Text rotation by mask** — the text is automatically aligned to the angle of the mask  
- **Multiline text support** — automatic line splitting  
- **Vertical and horizontal text orientation** - you write vertical text by typing one letter in each line  
- **Adjusting the letter and line spacing**  
- **Text outline** — customizable thickness and color  
- **Shadow** — adjustable displacement, blurring and transparency
- **Glow** — adjustable color, size, area and brightness  
- **Color** — HEX format support (#RRGGBB or #RRGGBBAA)  
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
| OUTLINE THICK      | Outline thickness                    | 0 - 50                |
| OUTLINE COLOR      | Outline color in HEX format          | #000000 - #FFFFFF     |
| ROTATE WITH MASK   | Rotate text by the angle of mask     | ON/OFF                |
| TEXT OPACITY       | Text transparency                    | 0.0 - 1.0             |
| LINE SPACING       | Line spacing                         | 0.5 - 3.0             |
| LETTER SPACING     | Letter spacing                       | -20 - +100            |
| ENABLE GLOW        | Enable glow                          | ON/OFF                |
| GLOW COLOR         | Color glow in HEX format             | #000000 - #FFFFFF     |
| GLOW SIZE          | Glow size                            | -500 - +500           |
| GLOW SPREAD        | Area of the glow                     | 0 - 500               |
| GLOW BRIGHTNESS    | Brightness of the glow               | 0.0 - 1.0             |
| ENABLE SHADOW      | Enable shadow                        | ON/OFF                |
| SHADOW COLOR       | Shadow color in HEX format           | #000000 - #FFFFFF     |
| SHADOW OFFSET X/Y  | Shifting the shadow                  | -500 - +500           |
| SHADOW BLUR        | Blurring the shadow                  | 0.0 - 1.0             |
| SHADOW BRIGHTNESS  | Brightness of the shadow             | 0.0 - 1.0             |
| SUPERSAMPLING      | Enable supersampling                 | ON/OFF                |
| SUPERSAMPLE FACTOR | Magnification factor                 | 2 - 4                 |
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

![Screenshot_7](https://github.com/user-attachments/assets/0e1a41f9-2d07-4bd7-892a-a377a8a975f9)

### 🔥 Features  
The node is used to save the image while preserving the workflow inside the image. You can add explanatory text to an image with a choice of background size, theme, font and its size. It is possible to add your own fonts (to the fonts folder). Use ttf and otf fonts.  
If the label is not needed, leave the text field blank and the image is saved as usual.  
Themes:  
light - white background, black text.  
dark - black background, white text.  

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

# 🦊 RS Loop Switch node  
**A combined node for generating a sequence of values with automatic switching**  

![Screenshot_1](https://github.com/user-attachments/assets/4e11bde0-55f8-4879-9290-b50ae452c55a)

### 🔥 Features  
The node generates a list of INT values, automatically switching between 10 preset values based on the current cycle step. It is ideal for generating a series of images with different seeds without the need to manually change the parameters. But you can use it for any other tasks where dynamic INT changes are required.  

### 🔌 Connection (examples)  
- RS Loop Switch (output) → KSampler (seed)  
- RS Loop Switch (output) → KSampler (steps)  
- RS Loop Switch (output) → any INT input  

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
