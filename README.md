# 🦊 ComfyUI_RaykoStudio  
Set of custom nodes for ComfyUI providing additional image processing capabilities  
---  
Nodes do not require the installation of additional Python packages.  
🖥️ Performance has been tested for:  

- ComfyUI 0.15 and above  
- Python 3.10 and above  
- Torch 2.8 and above
- Cuda 12.4 and above 

---

### 📃 Requirements  

- torch>=1.7.0  
- numpy>=1.19.0  
- Pillow>=8.0.0  
- freetype-py>=2.5.1  #only for the RS Text Overlay node  

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

# 🦊 RS Collage Node  
**Interactive node for overlaying images with real-time positioning, scaling, rotation, and edge feathering directly on the canvas.**  

https://youtu.be/nPSujGTI_7s

**Normal Mode**  
<img width="446" height="708" alt="Screenshot_1" src="https://github.com/user-attachments/assets/cd7da099-511a-4f28-a71e-54612f0c7f30" />  

**Advanced Mode**  
<img width="2106" height="955" alt="Screenshot_2" src="https://github.com/user-attachments/assets/0104c418-9126-4c11-8f2d-67f0969edb48" />  

### 🔥 Features  
- **Interactive Canvas** — Drag, resize, and rotate overlays with visual handles  
- **Center-Anchored Scaling** — Corner handles scale proportionally; edge handles scale along a single axis, both expanding/contracting from the geometric center  
- **Real-Time Feathering Preview** — Supports Radial Blur In, Radial Blur Out, Ellipse Blur In and Ellipse Blur Out modes with adjustable radius  
- **Non-Blocking Session** — Waits indefinitely for ✔️APPLAY or ❌CANCEL input without hard timeouts or queue interruption  
- **Precise Coordinate Mapping** — Maintains a frozen viewport matrix during interaction to prevent drift; converts relative normalized coordinates to absolute pixel transforms for the backend  
- **Integrated Controls** — Opacity slider, flip toggles, and feather parameters accessible via node widgets
- **Workflow is in the Example folder** — You can create an endless chain of these nodes - you connect the image output to the background input of the next node  

### 🖼️ Working Modes  
**Normal Mode**  
Quick editing directly inside the ComfyUI node. Perfect for simple tasks and final touches.  

**Advanced Mode**  
Fullscreen editor with side panel for fine-tuning:  
- Real-time display across the entire screen  
- Independent zoom (mouse wheel) and canvas panning  
- Camera automatically fits composition to 80% of window  
- Overlay can extend beyond background boundaries without scale recalculation  
- All parameters adjustable via convenient sliders

### 🔆 Feathering Types
| Type | Description |
|------|-------------|
|None|No feathering|
|Radial Blur In|Radial blur from center to edges|
|Radial Blur Out|Inverted radial blur|
|Ellipse Blur In|Elliptical blur from center|
|Ellipse Blur Out|Inverted elliptical blur|

- 💡 Each feathering type allows you to drag the effect center directly on the overlay.  

### 🪛 Usage  
For the overlay, it is better to use images with transparency (PNG, WebP, and TIFF files containing transparency) or images coming from the background removal node (RMBG). If you want to use a regular image or an RGB image with transparency for the overlay, but not RGBA, upload it via the 🦊 RS rgb2rgba node. Node will make or correct the Alpha channel correctly.  
Connect the tensors `background_image` and `overlay_image` to the node and start the generation.  
Adjust the overlay using the markers on the canvas:  
- **Corners** - Proportional scaling from the center  
- **Edges** - Scaling on one axis from the center  
- **Red cross** - Freely movable blur center  
- **Top yellow marker** - Rotate around the center   

Adjust the type of shading, radius, and opacity using widgets. After selecting the type of shading, a red cross will appear on the overlay, which can be used to specify the center of the shading or blur.  
Click ✔️APPLY to complete the transformations and continue plotting, or ❌CANCEL to interrupt the generation process.  
You can create a chain of these nodes by connecting the Image output to the Background input of the next node.

### 🛠️ Parameters
| Input/Widget | Type | Range | Default | Description |
|--------------|------|-------|---------|-------------|
| `overlay_image` | IMAGE | - | - | Foreground layer to composite |
| `background_image` | IMAGE | - | - | Base canvas layer |
| `overlay_mask` | MASK | - | `None` | Optional alpha mask (inverted on apply) |
| `opacity` | FLOAT | 0.0 – 1.0 | 1.0 | Global transparency multiplier |
| `feather_type` | COMBO | None / Radial In / Radial Out / Ellipse In / Ellipse Out | None | Edge softening algorithm |
| `blur_radius` | INT | 0 – 100 | 50 | Feather intensity/blur radius |
| `blur_hardness` | INT | 0 – 100 | 0 | Hardness of the blur borders |

### 💡 Tips  
- For quick starts use Normal Mode — all parameters are saved in the workflow  
- For precise tuning switch to Advanced Mode — it doesn't save state in workflow but gives more control  
- Corner handle scaling preserves aspect ratio  
- Edge handle scaling allows changing aspect ratio  
- If overlay has black corners after rotation, the node automatically removes them  

---
---

# 🦊 RS rgb2rgba  
**A lightweight ComfyUI custom node that loads images while preserving the alpha channel (RGBA). Ideal for workflows that require transparency handling in PNG, WebP, and TIFF formats.**  

<img width="1042" height="345" alt="Screenshot_3" src="https://github.com/user-attachments/assets/6159bcd5-2c65-4df8-8106-21c9b75669bd" />  

### 🔥 Features  
**Alpha Channel Preservation** - Loads and outputs images with full RGBA support.  
**Automatic Conversion** - Forces `RGBA` mode if the source image uses a different color mode.  
**Format Support** - Works seamlessly with `PNG`, `WebP`, and `TIFF` files containing transparency.  
**ComfyUI Compatible** - Returns a properly formatted `[1, H, W, 4]` float32 tensor normalized to `0.0–1.0`.  
**Change Detection** - Automatically refreshes the node output when the source file is modified.  

### 🪛 Usage  
Add the **`🦊 RS rgb2rgba`** node to your workflow.  
Upload an image or select one from your `ComfyUI/input` directory.  
Connect the `rgba` output to any node that accepts ComfyUI image tensors (e.g., `VAE Encode`, `PreviewImage`, mask processors, etc.).  

### 📝 Notes  
- Images without an existing alpha channel will be automatically converted to RGBA (alpha will be set to `1.0` / fully opaque).  
- The node expects images to be located in ComfyUI's standard `input` folder.  
- Designed to match ComfyUI's native `IMAGE` tensor format, ensuring drop-in compatibility with most custom nodes.  

---
---

# 🦊 RS Any Switch  
**A dynamic switch node for ComfyUI that allows you to switch between multiple inputs of ANY data type with an intuitive toggle interface.**  

<img width="511" height="395" alt="Screenshot_1" src="https://github.com/user-attachments/assets/f5b4ee5c-d342-4346-b101-d364d2f714f4" />
 
### 🔥 Features  
**Universal Type Support** - Accepts any data type (IMAGE, LATENT, MODEL, AUDIO, VIDEO, TEXT, etc.)  
**Dynamic Inputs** - Inputs are created automatically as you connect nodes (up to 20) 
**Smart Slot Management** - Empty slots are automatically removed, keeping your workflow clean  
**Visual Toggle Interface** - Each connected input has an ON/OFF toggle switch with the source node name (multilingual)  
**Exclusive Selection** - Only one input can be active at a time  
**Persistent State** - Active slot selection is saved with your workflow  
**Auto-Numbering** - Inputs are automatically numbered (Input 1, Input 2, etc.)  
**Smart Display** - Shows connected node names with automatic truncation (max 20 chars, multilingual)  
**Visual Status Bar** - Green/red bordered indicator showing current active slot or OFF state  
**'UPDATE NAME' button** - Updates the names of the connected nodes, if they have changed.

### 🪛 Usage  
1. **Add the Node**: Right-click in the graph → `🦊 RaykoStudio` → `RS Any Switch`  

2. **Connect Inputs**:  
   - Connect any node output to `input_1`  
   - The first connection automatically becomes active (ON)  
   - Additional connections create new toggle switches (OFF by default)  

3. **Switch Between Inputs**:  
   - Click the toggle switch next to any connected input  
   - Turn ON the desired input (others automatically turn OFF)  
   - The active slot is shown in the top status bar (green border)  

4. **Disconnect Inputs**:  
   - Simply disconnect the wire from any input  
   - The toggle switch is automatically removed  
   - Empty slots are cleaned up automatically  

### 📝 Notes  
**Example 1: Switch Between Images**
```
Load Image 1 ──→ input_1
Load Image 2 ──→ input_2
Load Image 3 ──→ input_3
                    ↓
              RS Any Switch
                    ↓
              Save Image
```
Toggle between different images without reconnecting wires.

**Example 2: Model Switching**
```
Checkpoint Loader A ──→ input_1
Checkpoint Loader B ──→ input_2
                           ↓
                     RS Any Switch
                           ↓
                     KSampler → VAEDecode → Save Image
```
Quickly compare results from different models.

**Example 3: Workflow Variations**
```
Upscale Method 1 ──→ input_1
Upscale Method 2 ──→ input_2
Upscale Method 3 ──→ input_3
                        ↓
                  RS Any Switch
                        ↓
                  Final Output
``` 

---
---

# 🦊 RS Outpaint  
**Interactive outpainting mask node with visual crop controls, preset management, and batch workflow support** 

<img width="1419" height="709" alt="Screenshot_2" src="https://github.com/user-attachments/assets/625b6043-688f-4bb2-a8eb-7a486f5f02f8" />  
<br>
<img width="1477" height="681" alt="Screenshot_1" src="https://github.com/user-attachments/assets/3d02cef1-b686-4714-8dcd-02dfba4da73a" />  

### 🔥 Features  
RS Outpaint is a custom ComfyUI node that turns mask/crop definition into an interactive, visual process. Instead of manually calculating coordinates or relying on static crops, you can drag, resize, and pan the crop region directly on the preview canvas.  
The node pauses the queue until you confirm the settings, then outputs a ready-to-use control image, alpha mask, and precise dimensions. It also includes a batch preset system that remembers your crop settings and applies them automatically to subsequent images in a sequence.  

❗ *All changes in the node (setting the mask, creating and applying presets, replacing colors, etc. settings) are available only when it is on pause in generation - "foolproof"*  
- **Visual Mask Editor** — Drag, resize, and position the crop area directly on the image preview  
- **Pause & Approve** — Workflow pauses after first execution, waiting for your confirmation  
- **Batch Mode** – Apply saved presets automatically to the next images in a queue. Auto-resets when the queue finishes  
- **Preset System** – Save, load, rename, and delete presets crop configurations.   
- **Grid Snapping** — All dimensions snap to 16px grid for clean, model-friendly outputs  
- **Aspect Ratio Lock** —  Switching 🔒🔓 between maintaining crop proportions and freely choosing the mask size   
- **Quick Presets** — One-click aspect ratios: 16:9, 9:16, 21:9, 4:3, 1:1, and more  
- **Smart Snapping** — Align crop to center, edges, or fit source dimensions  
- **Real-time UI** – Zoom (scroll), pan (middle-drag), instant dimension readouts, and padding indicators  
- **Color Mask and Background** — Selecting the color for the mask and background when using the mask_image output  
- **Padding Indicators** — Visual labels show generated padding areas (▲▼◀▶)  
- **Keyboard Shortcuts** — Arrow keys to nudge crop box (Shift for 4× step)  
- **Heartbeat** — mechanism to prevent freezes  
- **Instant reset** — reset of the state after each generation  

### 🪛 Usage  
❗ *The ⚙️ BATCH, ✔️ ACCEPT, and ❌ CANCEL buttons appear only after the generation is started.*  

**Single mode**  
Add the node to your workflow and connect an IMAGE input.  
Start the generation with the RUN button. After reaching the node, the generation will pause.  
Adjust the crop area using the markers.  
You can create or apply a previously created preset of settings.  
Click ✔️ ACCEPT to send the configuration to the backend.  
Use the outputs in your downstream nodes (ControlNet, mask blending, etc.).  
If you are not satisfied with something, you can click ❌ CANCEL to interrupt the generation process.  

**Batch mode**  
Add the node to your workflow and connect an IMAGE input.  
Select the number of passes in the generation queue.  
Start the generation with the RUN button. After reaching the node, the generation will pause.  
Adjust the crop area using the markers.  
You can create or apply a previously created preset of settings.  
Click the ⚙️ BATCH, it should turn green.  
Click ✔️ ACCEPT to send the configuration to the backend.  
Use the outputs in your downstream nodes (ControlNet, mask blending, etc.).  
If you are not satisfied with something, you can click ❌ CANCEL to interrupt the generation process.  

📁 Preset Storage  
Presets are stored as JSON files in the presets folder within the node's directory:  
ComfyUI/custom_nodes/ComfyUI_RaykoStudio/presets/  
The folder is created automatically the first time you save the preset.  

<details>
  <summary>✅ Update v0.16.3</summary>

 The logic of the RS Outpaint node interface has been changed.
1. The default borders of the mask frame are strictly along the borders of the incoming image
2. All node buttons are inactive until the process queue reaches the node and is paused. The buttons become inactive immediately after the generation continues or is canceled.
3. All snapping presets (aspect ratio) now work without crop and without resizing the output resolution. The frame is closely adjacent to two opposite sides or to one of the sides of the image (why one? since the mask works on a 16px grid, small margins of the mask are possible, which are visually visible. This is done so that the output always results in an image with side sizes that are multiples of 16. These errors will still be masked.)
4. By default, the Lock/Unlock aspect ratio button is unlocked (🔓) and you can immediately start working with the mask frame without saving the aspect ratio.
5. When you press any snap preset button, the Lock/Unlock button is automatically locked (🔒) and all further actions with the mask frame will be performed while maintaining the selected aspect ratio until you unlock the button again.

</details>  

💡Tip: For precise positioning, use the arrow keys on your keyboard (hold Shift to move faster)  

### ↔️ Inputs and Outputs:  
**Input** :  
image - Source image for outpainting  

**Output** :  
control_image - Image with masked area (gray padding where generation will occur)  
control_mask - Binary mask: 0 = keep original (black), 1 = generate new content (white)  
mask_image - Makes an image from a mask  
width - Final output width (after optional resize)  
height - Final output height (after optional resize)  

---
---

# 🦊 RS Load Image (former name RS Spline Mask)  
**Node for load image and creating a spline mask**  

<img width="800" height="715" alt="RS Load Image1" src="https://github.com/user-attachments/assets/c5150b6a-88b6-4e2a-86fa-7cd70346cab8" />

### 🔥 Features  
The node has the functionality of the native Load Image node, but instead of the native mask editor, a built-in spline editor is used. More accurate selection based on the principle of the Lasso tool from Photoshop.  

### 🪛 Usage  
The node is ready for use immediately after it is added. Images are added using the "🎨 IMAGE" (images from the input folder) and "🖼️ UPLOAD IMAGE" (images from any folder on your PC) buttons. You can scale the node to a convenient size to more accurately place the points of the spline. Incorrectly positioned points can be deleted by left-clicking with the CTRL key held down. To remove all points from the preview area, click the "🔴 CLEAR POINTS" button.  

### ↔️ Inputs and Outputs:  
The IMAGE output returns the original image unchanged. The MASK output returns a black and white mask where the white area corresponds to the drawn polygon.  

---
---

# 🦊 RS Intermediate Spline Mask  
**An interactive node for creating intermediate spline masks** 

![Screenshot_6](https://github.com/user-attachments/assets/c97fb1b8-5b1e-4c6b-bd49-af155e6f4d91)

### 🔥 Features  
Node allows you to pause the workflow at the image processing stage, manually select the desired area and continue generation without completely restarting the process. More accurate selection based on the principle of the Lasso tool from Photoshop.  

### 🪛 Usage  
When this node is reached, pipeline execution is automatically suspended. A preview of the input image is displayed in the node's interface.  The user can left-click to add polygon points. Incorrectly positioned points can be deleted by left-clicking with the CTRL key held down.    
The "✔️ ACCEPT" button confirms the created mask, after which the node completes processing and transmits the data further according to the scheme. The "🔴 CLEAR POINTS" button clears all the drawn points for redrawing. It is important that after using this button, you do not need to press the Prompt Queue again, just draw a new mask and press "✔️ ACCEPT". The "❌ CANCEL" button completely interrupts the process and resets the node status.  

### ↔️ Inputs and Outputs:
The IMAGE input accepts an image from any previous node. The IMAGE output returns the original image unchanged. The MASK output returns a black and white mask where the white area corresponds to the drawn polygon.  

---
---

# 🦊 RS Image Selector  
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
**The generation process will pause indefinitely until you click "✔️ ACCEPT", "❌ CANCEL" or close the workflow or the ComfyUI page.**  

---
---

# 🦊 RS Image to Latent & 🦊 RS Image to Latent (simplified)  
**A powerful and user-friendly ComfyUI node that converts images to latents with intelligent size optimization.**  

<img width="973" height="646" alt="Screenshot_1" src="https://github.com/user-attachments/assets/7b038c0f-a3a2-4034-8906-c0e01b6e4480" />

## 🦊 RS Image to Latent  
### 🔥 Features  
- **Multiple sizing modes** - Auto, Preset, Custom, or Megapixels  
- **VAE-aware** - Automatically detects divisibility requirements  
- **Batch processing** - Create multiple identical latents at once  
- **Smart upscaling** - Choose from multiple upscale methods  
- **Clean interface** - No technical clutter, just what you need  

### 🪛 Usage  
Resolution control - Ensure consistent sizes across your workflow  
VRAM optimization - Use megapixels mode to stay within limits  
Auto mode - Preserves original proportions  
Batch generation - Create multiple variations from one image  

### 🎯 Modes Explained  
**Auto**  
Preserves original image size and only rounds to meet VAE divisibility requirements. No unexpected upscaling.  

**Preset**  
Choose from 50+ common resolutions including:  
- Square: 512×512 to 1920×1920  
- Portrait: 3:2, 3:4, 9:16 and more  
- Landscape: 4:3, 16:9, 21:9 and more  

**Custom**  
Manually enter width and height (must be multiples of 8).  

**Megapixels**  
Set target megapixels with specific aspect ratio. Perfect for controlling VRAM usage.  

### 🔧 Rounding Modes  
- auto - Picks the nearest valid size (recommended)  
- shrink - Only reduces size, never increases  
- expand - Only increases size, never reduces  

### ↔️ Input and output:  
Input:  
image - Input image to convert to latent  
vae	- VAE model for encoding (auto-detects divisibility)  

Output:  
latent - The encoded latent tensor  
width_px - Final width in pixels  
height_px - Final height in pixels  
width_latent - Latent width (width/8)  
height_latent - Latent height (height/8)  

## 🦊 RS Image to Latent (simplified)  
**A simplified node that converts images to latent with intelligent size optimization.**  

### 🔥 Features  
- **Minimum settings** - Only batch size  
- **Default settings:**  
Automatically determines the multiplicity from VAE  
Rounds the image size to a multiple of the value  
If the size has changed, it will be resized via lanczos  
If it is already multiple, it encodes directly without a recycle  
Supports batch_size to create a batch of identical latents  
Returns 3 outputs: latent, width_px, height_px  

---
---

# 🦊 RS Crop Image and 🦊 RS Insert Crop  
**An interactive node that allows you to visually crop an image directly within the node interface. Unlike standard Crop nodes, here you see the image and draw the crop rectangle with your mouse — making the process precise and intuitive.  
The main feature is the Multiple mode, which guarantees that the cropped image size will be a multiple of a specified number (4, 8, 16, 32, or 64). This is critical when working with VAEs and generative models (SDXL, FLUX, SD 1.5б etc.) that expect certain size multiples.  
With further insertion of the cut fragment after its modification back into the original image.  
Automatically detect and crop regions of interest using masks. When a mask is connected, the node analyzes it and sets the crop area to the bounding box of all non-zero pixels.**  

### Usage only image
<img width="1380" height="690" alt="Screenshot_2" src="https://github.com/user-attachments/assets/d502da57-ea21-4660-89eb-5839bf966735" />

### Usage with mask
<img width="1526" height="773" alt="Screenshot_2" src="https://github.com/user-attachments/assets/edeaf451-f620-40d4-8a62-5b1e36354b30" />

### Usage Insert Crop
![Screenshot_2](https://github.com/user-attachments/assets/31c80d04-1b74-408f-88dc-d65cba0683ff)

### 🔥 Features  
- **Interactive cropping** — the image is displayed directly in the node, the rectangle is drawn with the mouse  
- **Moving** - Dragging the selected area  
- **Process pause** - Workflow waits for confirmation before continuing  
- **Visualization** - Real-time area size display  
- **Three actions** — Accept, Reset, Cancel  
- **Smart alignment** — Automatic size snapping to a chosen multiple  
- **Reverse paste support** — The `CROP_DATA` output contains precise coordinates for a second node that can paste the crop back into the original image  
- **State persistence** — Rectangle parameters are saved in the workflow  
- **Boundary protection** — The rectangle never leaves the image bounds  
- **Automatic Bounding Box Detection** — Calculates crop coordinates from the extreme points of the mask (leftmost, rightmost, top, bottom)  
- **Smart Thresholding** — Uses a 0.5 threshold to determine active mask pixels  
- **Seamless Integration** — Works with existing multiple_mode for grid-aligned cropping  
- **Visual Feedback** — Crop rectangle appears automatically on the overlay when mask is connected  

**🦊 RS Insert Crop** is a node that allows you to seamlessly insert a previously cut fragment back into the original image after it has been modified by the workflow nodes.  
- **Crop Data** - Inserting a fragment into the original image using the previously obtained precise cutout parameters.

### 🪛 Usage only image  
**🦊 RS Crop Image**  
Connect the image to the `IMAGE` input.  
Run queue (queue request) — the node will pause operation and display the clipping area as a rectangle.  
Adjust the rectangle borders:  
- Drag the rectangle — move it entirely  
- Drag the corner markers — resize the rectangle  

If necessary turn on "Multiple" and select a multiplier.  
Click ✔️ ACCEPT button — the node will continue the queue operation and output the cropped image.  

### 🪛 Usage with mask  
Connect your image to the image input  
Connect a mask to the mask input  
The crop area will automatically adjust to fit the mask boundaries  
If multiple_mode is ON, the crop box will be aligned to the specified multiple (8, 16, 32, 64, etc.)  
Click ✔️ ACCEPT to apply the crop or adjust manually  

**Button**:  
✔️ ACCEPT - Confirm the allocation and continue workflow  
🔄 RESET - Reset the selection and select again  
❌ CANCEL - Cancel and interrupt generation  

**🦊 RS Insert Crop**  
Connect the original image to the Original Image input.  
Connect the embedded and modified fragment to the Cropped Image input.  
Connect the node with the text Crop Data.  

## 🎯 Use Cases  
**1. Preparing a crop for VAE/generation**  
Enable `Multiple = ON`, choose `8` (for SD 1.5 / SDXL) or `16`/`64` (for FLUX). The result is guaranteed to be accepted by the VAE without warnings about non-multiple sizes.  
**2. Precise region editing**  
Crop the desired area → send it to an inpaint node → after generation, paste the result back using `CROP_DATA`. The reverse paste will be pixel-perfect.  
**3. Comparing results on the same region**  
Draw a rectangle, save the parameters → run different models/seeds through the same crop → `CROP_DATA` stays consistent between runs.  
**4. Isolating a face/object**  
Scale up the node, draw a precise rectangle around a face, send it to a face-swap or restoration pipeline.  

### ⚠️ Reminder  
**The generation process will be suspended indefinitely until you click "✔️ ACCEPT", "❌ CANCEL" or close the workflow or the ComfyUI page.**  

---
---

# 🦊 RS Styles Loader  
**Node for uploading and managing styles from CSV files**  

![Screenshot_1](https://github.com/user-attachments/assets/9c3d45f2-8efc-4600-93f7-0c0b7a74e366)

### 🔥 Features  
- **Download CSV files** - Upload your files with styles directly through the interface  
- **Tree structure** - Styles are organized by folders (categories)  
- **Visual selection** - User-friendly interface with drop-down lists  
- **Bypass styles** - Turn styles on/off without deleting them from the list  
- **Combining** - Multiple styles are combined into one prompt  
- **Save to workflow** - All settings are saved along with the project
- 
### 🪛 Usage  
**Buttons**  
SELECT CSV FILE - Select the desired CSV file from the list of files that you have already uploaded earlier.  
📂 UPLOAD NEW CSV FILE - Download a new CSV file from anywhere on your PC. It will automatically appear in the styles folder and in the future you will be able to select it with the "SELECT CSV FILE" button.  
➕ ADD STYLE - Choosing the styles you need  
🟢 - Bypass on/off. You can choose an infinite number of styles and change them to create the combination you need.  
❌ - Removing a style from the panel  

### 🎨 Styles  
**You can use your own styles or find them in the ComfyUI community**  
For example:  
https://github.com/vaulthunt3r/ComfyUI-Style-Prompts-Collection  
https://github.com/Art-xmaster/comfyui-AGSoft/tree/main/styles  

### ⚠️ Notes  
The styles folder is created automatically at the first startup.  
When deleting a node from workflow, the uploaded CSV files are not deleted.  
To update the list of files after adding CSV manually, restart ComfyUI.  

---
---

# 🦊 RS Last Frame  
**A lightweight ComfyUI node that extracts the last frame from any video input.** 

![Screenshot_5](https://github.com/user-attachments/assets/19f7b743-7cfa-4446-8478-1e7db0a29368)

### 🔥 Features  
- **Universal Input Support** — Accepts native VideoFromFile objects (ComfyUI's built-in video loader), standard IMAGE tensors (VHS, Image Batch), and dictionary formats
- **Zero Dependencies** — Works out-of-the-box without requiring Video Helper Suite or other external libraries
- **Automatic Format Detection** — Intelligently handles different tensor dimensions [F, H, W, C], [B, F, H, W, C], or channel-first formats
- **Memory Efficient** — Extracts frames without unnecessary copying or conversion 

### 🪛 Usage  
If video has only 1 frame, that frame is returned unchanged  
Automatically handles batched inputs by taking the first batch element  
Channel permutation applied automatically if decoder outputs [F, C, H, W]  
Compatible with ComfyUI v1.0+ and all major video loading extensions  

### ↔️ Input and output:  
Input: video_frames (* — Universal)  
Accepts:  
- IMAGE tensor from VHS loaders, Image Batch, or standard image nodes  
- VideoFromFile object from ComfyUI's native Load Video node  
- Dictionary with frames, images, or video keys

Output: IMAGE (torch.Tensor)  
Single frame tensor with shape [1, H, W, C] — ready for VAE encoding, preview, or any image processing node.  

---
---

# 🦊 RS Models Loader  
**A powerful all-in-one model loader node for ComfyUI that combines UNET, CLIP (with optional dual CLIP support), VAE, and LoRA loading into a single interface.**  

<img width="1394" height="590" alt="Screenshot_1" src="https://github.com/user-attachments/assets/4f218267-73e0-4c30-aab3-5bea05936311" />

### 🔥 Features  
- **Unified Loading** - Load UNET, CLIP, VAE, and multiple LoRAs in one node  
- **Dual CLIP Support** - Toggle between single CLIP mode (CLIPLoader) and dual CLIP mode (DualCLIPLoader) for models like Flux, SD3, Hunyuan DiT, and PixArt  
- **LoRA Management** - Add, enable/disable, and adjust strengths for multiple LoRAs with an intuitive visual interface  
- **Persistent Storage** - LoRA configurations are saved per node and persist across sessions  
- **Folder Structure** - Browse LoRAs with folder tree navigation  
- **Search Functionality** - Quickly find LoRAs by name

### 📃 Notes

- When dual CLIP mode is disabled, clip_name2 is visible but disabled (grayed out)
- The node automatically falls back to single CLIP mode if clip_name2 is empty
- LoRA strengths can be set independently for model and CLIP
- All settings are saved with your workflow and persist across ComfyUI sessions

---
---

# 🦊 RS Prompts  
**Node that provides enhanced prompt management with visual controls, pause-for-edit mode, and external input toggling**  

<img width="1008" height="774" alt="Screenshot_1" src="https://github.com/user-attachments/assets/1b912d1f-ccea-41b7-9f13-c63e0a2ca2bd" />

### 🔥 Features  
- **Dual prompt sources** - Use internal textarea or external text input
- **External input toggle** - Enable/disable external text input with one click
- **Pause-for-edit mode** - Interrupt generation, edit prompts, and continue
- **Visual status indicator** - Shows current prompt source and mode
- **Prompt presets** - Save, load, and delete prompt templates
- **Clean interface** - Minimal design that blends with ComfyUI

### ↔️ Input and output:  
**Inputs**  

| Name | Type | Description |
|------|------|-------------|
| clip | CLIP | CLIP model for encoding |
| text_input | STRING (optional) | External prompt source |

**Outputs**  

| Name | Type | Description |
|------|------|-------------|
| POSITIVE | CONDITIONING | Encoded positive prompt |
| NEGATIVE | CONDITIONING | Encoded negative prompt (empty) |
| PROMPT_STRING | STRING | Final prompt text |

### 🪛 Usage  

### Prompt Sources  
- **Local prompt**: Uses text from the internal textarea  
- **External input**: Uses text from connected `text_input` node  

The `🔘 Disable text input` toggle lets you temporarily ignore external input without disconnecting cables.  

### Pause Mode  
1. Enable `⏸️ Pause for edit`  
2. When external data arrives, the node pauses and shows an overlay  
3. Edit the prompt as needed  
4. Click `APPROVE` (use edited) or `REJECT` (use original)  
5. Generation continues with your choice  

The pause toggle stays enabled after approval, automatically pausing on next external data.  

### Usage Examples  
**Local Prompt Only**  
- Leave `text_input` disconnected  
- Or connect but enable `🔘 Disable text input`  
- Write prompts directly in textarea  

**External Prompt Source**  
- Connect a text node to `text_input`  
- Disable `🔘 Disable text input`  
- Enable `⏸️ Pause for edit` for manual review  

### Prompt Presets  
1. Write your prompt  
2. Click `💾 Save prompt` and enter a name  
3. Later click `📂 Select prompt` to load  
4. Delete presets via ❌ button in the list  

### 🖥️ Node Interface  

| Control | Description |
|---------|-------------|
| 🔘 Disable text input | Toggle external input on/off (🔴 when disabled) |
| ⏸️ Pause for edit | Enable edit mode (activates when external data arrives) |
| Status indicator | Shows: 📝 Local prompt / 🔌 External input / ⏸️ WAITING FOR EDIT |
| Text area | Main prompt editor |
| ❌ Clear prompt | Clear the text area |
| 💾 Save prompt | Save current prompt as preset |
| 📂 Select prompt | Load saved prompt preset |
| ✔️ APPROVE & CONTINUE | Accept edited prompt and continue |
| ❌ REJECT | Keep original prompt and continue | 

### 📂 Prompts Storage  
Prompts are stored as JSON files in the prompts folder within the node's directory:  
ComfyUI/custom_nodes/ComfyUI_RaykoStudio/prompts/  
The folder is created automatically the first time you save the prompt.  

### 🐛 Known Issues & Solutions  
Text not saving	- Check write permissions for prompts folder  
Pause mode not working - Ensure toggle is ON before starting generation  

---
---

# 🦊 RS Text Overlay  
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

# 🦊 RS Color Picker  
**A node for selecting a color and displaying its HEX parameters**  

<img width="372" height="416" alt="Screenshot_3" src="https://github.com/user-attachments/assets/ab1681d0-0276-4ef6-a34d-56f181661034" />  

### 🪛 Usage  
Click on the color window, select the color with the cursor on the palette, or click the pipette icon and select a color anywhere on the monitor.  
A HEX of this color will appear in the text field, which you can copy to the clipboard.  

---
---

# 🦊 RS Saturation  
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

# 🦊 RS Save Image  
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

# 🦊 RS Save Image Pair  
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

# 🦊 RS Image-Text  
**Node embeds any hidden text into the image that can be used later**  

![RS Image-Text ](https://github.com/user-attachments/assets/c8b119bb-c695-4500-8cc1-0a3c0d96e299)

### 🔥 Features  
The node writes any hidden text to any png and jpeg file (jpeg is converted to png). And outputs text from images recorded in this way. You can use it instead of a Load Image (without a mask) and transfer the recorded text to the promt node. It is useful if there is an image and a prompt to it, but the image does not contain a workflow (often found on the site civitai.com).  

### 🪛 Usage  
Two modes:  
Write - writes text to the uploaded image and saves it to the output folder with the prefix you specified.  
Read - reads the text you wrote earlier in the uploaded image, sends the text and images further according to the scheme.  

Link to the video: https://youtu.be/1s26hUcVXX4  

---
---

# 🦊 RS Loop Switch  
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

# 🦊 ComfyUI Settings Manager  
**A  user-friendly extension that allows you to easily backup, restore, and manage your interface settings. Never lose your custom UI layout, preferences, or configurations again!**  

<img width="580" height="783" alt="Screenshot_3" src="https://github.com/user-attachments/assets/2db2e5c7-055b-40c0-805d-167dde6d47e2" />

### 🔥 Features  
- **Smart Backups** - Save your current interface settings with custom names. If no name is provided, it automatically uses a timestamp.  
- **Easy Restore** - Select any previous backup from a clean UI list and restore it in one click.  
- **Built-in Server Restart** - Restoring settings requires a server restart. The extension provides a dedicated, pulsing **RESTART SERVER** button to make this obvious and safe.  
- **Auto-Refresh Polling** - After restarting, the extension automatically pings the server and refreshes your browser page the moment ComfyUI is back online.  
- **Manage Backups** - Delete old or unnecessary backups directly from the interface without leaving ComfyUI.  
- **Safe Naming** - Automatically sanitizes custom backup names (removes invalid characters) and prevents overwriting by adding suffixes (`_1`, `_2`) if a name collision occurs.
- You can use common settings for multiple versions or assemblies of ComfyUI.
- You can create several interface configurations and change them with a couple of clicks, rather than crawling through all the settings tabs.
- It's also useful for those who mess up the interface settings a lot - you can always roll back to the previous version.

### 🪛 Usage  
**Accessing the Manager**  
Look for the **Desktop/Monitor icon** (🖥️) in the left sidebar of ComfyUI. Click it to open the **Settings Manager** panel.  

**Saving Settings (Backup)**  
1. In the **Save Interface Settings** section, you will see a text field. 
2. *(Optional)* Enter a custom name for your backup (e.g., `my_favorite_layout`).  
   - *Note: If you leave it empty, the current date and time will be used.*  
3. Click the **💾 Save Settings** button.  
4. A green status message will appear at the bottom confirming the save. If the list of backups is open, the new backup will instantly appear at the top.  

**Restoring Settings**  
1. In the **Restore Interface Settings** section, click **📂 Load Backups**.  
2. A list of your saved backups will appear.  
3. Click **✓ Restore** next to the backup you want to load.  
4. The button will change to **✓ Restored**, and a new, pulsing orange button **🔄 RESTART SERVER** will appear.  
5. Click **🔄 RESTART SERVER**.  
6. The extension will automatically wait for the server to come back online and **refresh your browser page** automatically.  

**Deleting Backups**  
1. Load your backups list.  
2. Click the red **✕** button next to any backup you want to remove.  
3. The backup is instantly deleted from the UI and the file system.

### 📁 File Structure

All backups are stored outside the ComfyUI directory to keep your installation clean. By default, they are saved in your user Documents folder:

```text
📂 Documents/
 ── 📂 ComfyUI_Settings_Backups/
      ├── 📂 2026-06-09_12-40-44/
      │    ── 📄 comfy.settings.json
      ├── 📂 my_favorite_layout/
      │    └── 📄 comfy.settings.json
      ── ...
```
###  ⚙️ Technical Notes  
- **Server Restart** - The extension uses `os.execv` to restart the Python server. If you are using a third-party launcher (like Stability Matrix or Pinokio), the server might close but not automatically reopen. In this case, simply restart your launcher manually.  
- **Polling** - After a restart, the extension pings the server every 5 seconds (up to 10 times) to detect when it's fully loaded before triggering the page reload.  

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

Apache License 2.0. Use at your own risk without any warranties. See the [LICENSE](LICENSE) file for details  

---

## ❤️ Acknowledgments  

Thanks to ComfyUI community for inspiration and support.  
Special thanks to **FotoSHAMAN** for his fantastic ideas!  
If you like this node, don't forget to star on GitHub!  
