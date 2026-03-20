# 🦊 ComfyUI_RaykoStudio  
Set of custom nodes for ComfyUI providing additional image processing capabilities  
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

# 🦊 RS Spline Mask   
![Screenshot_1](https://github.com/user-attachments/assets/33544b90-d83c-4b9a-90e8-f94207aff158)

### 🔥 Features  
The node is designed to create masks without using the ComfyUI native editor. More accurate selection based on the principle of the Lasso tool from Photoshop.  

### 🪛 Usage  
The node is ready to use immediately after adding it. You can scale the node to a convenient size to more accurately place spline points. Incorrectly placed dots can be deleted by right-clicking on them. To remove all points from the preview area, click the ❌ Clear Points button. For convenience, a green frame has been made that shows the area where you can put dots. The frame is slightly larger than the preview size so that the dots can be placed outside the preview, which guarantees that the mask completely covers the edge of the image.  

Link to the video: https://youtu.be/AqNLmLzSunU

---
---

# 🦊 RS Models Loader   
![Screenshot_1](https://github.com/user-attachments/assets/07fc6e91-1cfd-47ff-804c-6befc3198234)

### 🔥 Features  
The node combines the loaders of the model, clip, vae and lore.
If you have downloaded a new node, then you do not need to update the comfi or the page - there is a button to update the LoRA list.  

Link to the video: https://youtu.be/LxhVk5C_oas

---
---

# 🦊 RS Saturation node  
**Professional image saturation control with artifact and highlight protection.**  

<img width="1024" height="742" alt="RS-SaturationNode" src="https://github.com/user-attachments/assets/ac9cb838-fe67-4707-bdd4-38fab85eca2c" />

### 🔥 Features  
- **Smooth adjustment** with 0.05 steps  
- **Smart boosting** without overexposure  
- **Artifact protection** even at extreme values  
- **Batch processing** optimized  
- **Supports**: Windows/Linux · Python 3.11+ · PyTorch 2.0+    

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
![Screenshot_1](https://github.com/user-attachments/assets/db6d8553-6122-40c7-93c2-7deb596b98f1)

### 🔥 Features  
The node is used to save the image while preserving the workflow inside the image. You can add explanatory text to an image with a choice of background size, theme, font and its size. It is possible to add your own fonts (to the fonts folder). Use ttf and otf fonts.  
If the label is not needed, leave the text field blank and the image is saved as usual.  

---
---
	
# 🦊 RS Save Image Pair node  
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

# 🦊 RS Image-Text   
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
