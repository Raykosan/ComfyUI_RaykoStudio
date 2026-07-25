# 🦊 ComfyUI_RaykoStudio  
Set of custom nodes for ComfyUI providing additional image processing capabilities  
--- 
---  

<details>
  <summary>🖥️ Performance has been tested for</summary>

- ComfyUI 0.15 and above  
- Python 3.10 and above  
- Torch 2.8 and above  
- Cuda 12.4 and above  

</details>
<details>
  <summary>📃 Requirements</summary>

- torch  
- opencv-python  
- numpy  
- Pillow>=10.0.0  
- freetype-py>=2.5.1  
- pycairo>=1.29.0  
- scipy>=1.10.0  

</details>
<details>
  <summary>🛠 Installation</summary>	
  
Set of nodes can be installed in several ways:  
- Clone repository to `ComfyUI/custom_nodes/` folder:  
```
git clone https://github.com/Raykosan/ComfyUI_RaykoStudio.git  
```
- Download the ZIP, unzip and put ComfyUI_RaykoStudio folder to: ComfyUI/custom_nodes/  
- You can install this node using the ComfyUI_Manager  
- To update ComfyUI_RaykoStudio, use the update.bat file  

</details>

---
---

# NODES
<details>
  <summary>🦊 RS Collage Node</summary>	
	
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

</details>
<details>
  <summary>🦊 RS RS Bypass Manager</summary>

# 🦊 RS RS Bypass Manager  
**A powerful node for managing the states of Bypass nodes and groups in complex ComfyUI circuits. If your workflow has turned into a "spaghetti monster" and you need to quickly disable entire modules (for example, switch between txt2img, inpaint and upscale), this node will save you dozens of clicks and nerves.**  

https://youtu.be/Ockp2SpuFSY

<img width="623" height="583" alt="Screenshot_5" src="https://github.com/user-attachments/assets/c4193648-0e3b-4499-bb14-aff6d59e0345" />

### 🔥 Features  
**Smart Search** - Instant search for the desired nodes and groups by name right inside the drop-down menu.  
**Group Support** - Works with ComfyUI groups. Groups can be collapsed and expanded to select individual nodes within them.  
**Color indication**:  
 * 🔴 **Red** — the group or node is completely blocked.  
 * 🟠 **Orange** — only part of the node is bypassed in the group (partial bypass).  
 * ⚪ **Gray** — the node/group is active.
   
**List of active bypasses** - All blocked elements are displayed directly on the node. You can delete a bypass by clicking on the node or group name.  
**Smart State saving** - The bypass status is saved directly in the JSON workflow. No data is lost when restarting ComfyUI, switching tabs, or sharing PNG/JSON.  
**Dynamic size** - The node automatically adjusts its height to the number of mounted elements.  
**Advanced UX**:  
  * The menu **does not close** when you click on an item, you can quickly reset several nodes in a row.  
  * The menu closes automatically when the mouse cursor moves outside of it (with a slight delay for comfort).  
  * The `SELECT' field...` is highlighted in orange while the menu is open.  
  * The node excludes itself from the list of elements available for bypass.  

### 🪛 Usage  
Add the **🦊 RS Bypass** node to the canvas (category `🦊 RaykoStudio').  
Click on the **SELECT...** field. A menu opens with all the groups and nodes of your scheme.  
If there are a large number of nodes, use the search bar to filter.  
Click on groups or nodes to switch their state (Bypass/Active).  
   * *Tip: Clicking on the name of the group bypasses it entirely. Clicking on the arrow (▶) will expand the group to select individual nodes.*
     
When you're done, just move the mouse cursor outside the menu — it will close itself in half a second.  
To remove the bypass, click on the name of the desired item in the list on the node itself.  

If a node is added to a circuit that already has bypass nodes, it will automatically display them in the interface.  
Also, when using bypass using comfi's own methods (the context menu is bypass, bypass in the NodeMap side menu, or bypass buttons above the node), all changes will instantly appear in the node.  

</details>
<details>
  <summary>🦊 RS rgb2rgba</summary>
	
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

</details>
<details>
  <summary>🦊 RS Any Switch</summary>
	
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

</details>
<details>
  <summary>🦊 RS Outpaint</summary>

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

</details>
<details>
  <summary>🦊 RS Ref 2 Latent</summary>

# 🦊 RS Ref 2 Latent 
**A lightweight node that encodes a reference image into latent space and injects it into positive/negative conditioning for reference-based generation workflows.**  

<img width="490" height="286" alt="Screenshot_1" src="https://github.com/user-attachments/assets/d8d41f90-765e-4618-84b0-f54af656f1f5" />

### 🔥 Features  
- **Image Processing** - Takes reference image and encodes it through VAE  
- **Conditioning Injection** - Automatically adds reference latents to both positive and negative conditioning  
- **Automatic Size Handling** - Intelligently scales image dimensions to match VAE requirements  
- **Clean & Simple** - No unnecessary complexity - just reference image → latent → conditioning  
- **Compatible** - Works with all VAE-based models  

### ↔️ Inputs and Outputs  

| Input | Type | Description |
|-------|------|-------------|
| `vae` | VAE | VAE model used to encode the image into latent space |
| `image` | IMAGE | Reference image to encode |
| `positive` | CONDITIONING | Positive conditioning from CLIP text encoder |
| `negative` | CONDITIONING | Negative conditioning from CLIP text encoder |


| Output | Type | Description |
|--------|------|-------------|
| `positive` | CONDITIONING | Modified positive conditioning with reference latents |
| `negative` | CONDITIONING | Modified negative conditioning with reference latents |
| `latent` | LATENT | Encoded reference image as latent |

### 🪛 Usage  
1. **Input Processing**: The node receives your reference image and VAE  
2. **Size Calculation**: Automatically calculates optimal dimensions (multiples of 64 for most VAEs)  
3. **Encoding**: Upscales the image using Lanczos interpolation and encodes it through VAE  
4. **Conditioning Injection**: Adds the encoded latent to both positive and negative conditioning under the key `reference_latents`  
5. **Output**: Returns modified conditioning and the latent representation  

</details> 
<details>
  <summary>🦊 RS Image Compare </summary>

# 🦊 RS Image Compare  
**A node that provides an interactive image comparison interface with zoom and pan controls**  

<img width="723" height="933" alt="Screenshot_6" src="https://github.com/user-attachments/assets/06e78014-f95b-4064-8d1f-9a93992f72f6" />

### 🔥 Features  
- **Side-by-side comparison** - Compare two images using an interactive slider  
- **Zoom control** - Zoom in from 1.0x to 10.0x with precise control  
- **Pan controls** - Pan horizontally and vertically to explore zoomed images (-100% to +100%)  
- **Interactive slider** - Drag the divider to reveal more of either image  
- **Reset functionality** - Individual reset buttons for each parameter + global "Reset All" button  
- **Auto-reset** - Parameters automatically reset to defaults when new images are loaded  

### 🪛 Usage  
**Slider** - Drag the vertical divider left or right to compare images  
- Left position: Shows only `image_2`  
- Right position: Shows only `image_1`  
- Middle position: Shows both images equally  

**Zoom** - Adjust zoom level from 1.0 to 10.0  
- Drag the slider or click anywhere on the slider track to jump to that position  
- Click the 🔃 button to reset to 1.0  

**Pan H** - Horizontal panning from -100% to +100%  
- Works in conjunction with zoom to navigate the image  
- Click the 🔃 button to reset to 0  

**Pan V** - Vertical panning from -100% to +100%  
- Works in conjunction with zoom to navigate the image  
- Click the 🔃 button to reset to 0  

**🔄 Reset All Parameters** - Reset all controls (Zoom, Pan H, Pan V) to their default values  

### ⚙️ Technical Details  
All pan and zoom operations are performed relative to the image center  
Pan values are expressed as percentages of the zoomed image dimensions  
Images are automatically scaled to fit the display area while maintaining aspect ratio  

### 🔎 Use Cases  
Before/after image comparisons  
Quality assessment between different models or configurations  
Detailed inspection of image differences at various zoom levels  

</details>
<details>
  <summary>🦊 RS Load Image</summary>

# 🦊 RS Load Image  
**A node for load image and creating a spline mask**  

<img width="800" height="715" alt="RS Load Image1" src="https://github.com/user-attachments/assets/c5150b6a-88b6-4e2a-86fa-7cd70346cab8" />

### 🔥 Features  
The node has the functionality of the native Load Image node, but instead of the native mask editor, a built-in spline editor is used. More accurate selection based on the principle of the Lasso tool from Photoshop.  

### 🪛 Usage  
The node is ready for use immediately after it is added. Images are added using the "🎨 IMAGE" (images from the input folder) and "🖼️ UPLOAD IMAGE" (images from any folder on your PC) buttons. You can scale the node to a convenient size to more accurately place the points of the spline. Incorrectly positioned points can be deleted by left-clicking with the CTRL key held down. To remove all points from the preview area, click the "🔴 CLEAR POINTS" button.  

### ↔️ Inputs and Outputs:  
The IMAGE output returns the original image unchanged. The MASK output returns a black and white mask where the white area corresponds to the drawn polygon.  

</details> 
<details>
  <summary>🦊 RS Intermediate Spline Mask</summary>

# 🦊 RS Intermediate Spline Mask  
**An interactive node for creating intermediate spline masks** 

<img width="579" height="804" alt="Screenshot_4" src="https://github.com/user-attachments/assets/1072de6b-f5bb-46c8-bbcb-321c499a7810" />

### 🔥 Features  
Node allows you to pause the workflow at the image processing stage, manually select the desired area and continue generation without completely restarting the process. More accurate selection based on the principle of the Lasso tool from Photoshop.  
The **⚙️ BATCH** button enables continuous processing mode, allowing the node to reuse the same mask across multiple queue iterations without requiring manual re-drawing.

### 🪛 Usage  
When this node is reached, pipeline execution is automatically suspended. A preview of the input image is displayed in the node's interface.  The user can left-click to add polygon points. Incorrectly positioned points can be deleted by left-clicking with the CTRL key held down.    
The "✔️ ACCEPT" button confirms the created mask, after which the node completes processing and transmits the data further according to the scheme. The "🔴 CLEAR POINTS" button clears all the drawn points for redrawing. It is important that after using this button, you do not need to press the Prompt Queue again, just draw a new mask and press "✔️ ACCEPT". The "❌ CANCEL" button completely interrupts the process and resets the node status.  

**Single Run (Default)**  
1. Queue prompt → node pauses, shows image  
2. Draw mask on overlay  
3. Click **✔️ ACCEPT**  
4. Processing continues normally  

**Batch Run**  
1. Set the value for batch processing in the Batch Count menu (located next to the RUN button)  
2. Queue prompt → node pauses, shows image  
3. Draw mask on overlay  
4. Click **️  BATCH** (button turns  orange)  
5. Click **✔️ ACCEPT** — mask is saved, queue continues  
6. On next iteration: **no pause**, saved mask is applied automatically  
7. Repeat until `Batch Count` is exhausted or queue is stopped  

**Stopping Batch Mode**  
Batch mode is automatically deactivated in the following cases:  
- **❌ CANCEL** button is clicked — stops the queue and clears the saved mask  
- **Queue completes** — after the last iteration finishes, batch mode resets automatically (~2 seconds delay)  
- **Node is removed** from the graph — saved mask is cleared  

### ↔️ Inputs and Outputs:  
The IMAGE input accepts an image from any previous node. The IMAGE output returns the original image unchanged. The MASK output returns a black and white mask where the white area corresponds to the drawn polygon.  

</details>
<details>
  <summary>🦊 RS Image Selector</summary>

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

</details>
<details>
  <summary>🦊 RS MultiLatent</summary>

# 🦊 RS MultiLatent  
**Universal latent generation node - automatically adapts to any VAE architecture.** 

<img width="445" height="622" alt="Screenshot_3" src="https://github.com/user-attachments/assets/70994d2c-8a64-4f43-84b9-a2eea57df3fb" />

### 🔥 Features  
- **Automatic VAE Detection** - reads `latent_channels` and `scale_factor` directly from VAE  
- **Universal Compatibility** - works with SD1.5, SDXL, Flux, Flux.2, Krea2, QwenImage, and many other models  
- **Flexible Sizing** - three modes: Preset, Custom, and Megapixels  
- **100+ Presets** - extensive library of ready-to-use resolutions  
- **Smart Device Handling** - automatically matches VAE device and dtype  

### 🪛 Usage  
1. **Connect VAE**: Plug any VAE into the `vae` input  
2. **Choose size mode**:  
  - Preset: Select from 100+ predefined resolutions  
  - Custom: Manually enter width and height  
  - Megapixels: Specify target resolution in MP with aspect ratio  
3. **Connect to sampler**: Use the `latent` output with KSampler or other nodes  

### ⚙️ Settings  
**size_mode**: Size definition mode  
  - `Preset` - Use predefined resolutions  
  - `Custom` - Manual width/height input  
  - `Megapixels` - Target resolution in megapixels  

**preset** (only for Preset mode): Choose from 100+ resolutions including:  
  - Square formats (512×512 to 2016×2016)  
  - Portrait formats (4:5, 3:4, 2:3, 9:16, 21:9, etc.)  
  - Landscape formats (5:4, 4:3, 3:2, 16:9, 20:9, etc.)

**width/height** (only for Custom mode): Custom dimensions (8-4096px)

**megapixels** (only for Megapixels mode): Target resolution (0.1-10.0 MP)  

**aspect_ratio** (only for Megapixels mode): 1:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16, 21:9, 9:21, 4:5, 5:4  

**batch_size**: Number of latent images to generate (1-64)  

</details>
<details>
  <summary>🦊 RS Image to Latent & 🦊 RS Image to Latent (simplified)</summary>

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

</details> 
<details>
  <summary>🦊 RS Crop Image and 🦊 RS Insert Crop </summary>

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

</details>
<details>
  <summary>🦊 RS Styles Loader</summary>

# 🦊 RS Styles Loader  
**A node designed for managing, combining, and saving styles from CSV files. The node generates ready-made Positive and Negative promptes based on selected styles, providing an advanced and intuitive interface.**  

<img width="572" height="720" alt="Screenshot_1" src="https://github.com/user-attachments/assets/2ca33792-d826-482a-b7c0-636ea63005ac" />

### 🔥 Features  
- **Download CSV files** - Upload your files with styles directly through the interface  
- **Tree structure** - Styles are organized by folders (categories)  
- **Visual selection** - User-friendly interface with drop-down lists  
- **Bypass styles** - Turn styles on/off without deleting them from the list  
- **Combining** - Multiple styles are combined into one prompt  
- **Automatic recycle** - The height of the node automatically adjusts to the number of styles (up to 10 visible lines), after which convenient mouse wheel scrolling is enabled  
- **Save to workflow** - All settings are saved along with the project  

### ⭐ Favorites System  
* Quick access to frequently used styles via the **FAVORITES** button.  
* Add to favorites directly from the style selection menu (star icon).  
* **Global Conservation** - Favorites are stored on the server (`favorites.json`) and is available for all nodes in any workflow.  

### 💾 Preset System  
* **Save / Load:** - Save and download complete sets of styles (along with the selected CSV file) in one click.  
* **Management:** - Remove unnecessary presets directly from the download menu.  

### 🪛 Usage  
**Buttons**  
SELECT CSV FILE - Select the desired CSV file from the list of files that you have already uploaded earlier.  
📂 UPLOAD NEW CSV FILE - Download a new CSV file from anywhere on your PC. It will automatically appear in the styles folder and in the future you will be able to select it with the "SELECT CSV FILE" button.  
➕ ADD STYLE - Choosing the styles you need  
🔴 Clear All - Instantly clears the list of active styles  
🔄️ Reset Size - Resets the node size to the default size (by the number of styles) if you manually stretched it  
💾 Save - Saves all active styles to a preset (along with the name of the selected CSV file)  
📂 Load - Loads the saved preset (along with the CSV preset file)  
🟢 - Bypass on/off. You can choose an infinite number of styles and change them to create the combination you need.  
❌ - Removing a style from the panel  

### 🎨 Styles  
**You can use your own styles or find them in the ComfyUI community**  
For example:  
https://github.com/vaulthunt3r/ComfyUI-Style-Prompts-Collection  
https://github.com/Art-xmaster/comfyui-AGSoft/tree/main/styles  

### ⚠️ Notes  
The styles, favorites and presets folders is created automatically at the first startup.  
When deleting a node from workflow, the uploaded CSV files are not deleted.  
To update the list of files after adding CSV manually, restart ComfyUI.  

</details>
<details>
  <summary>🦊 RS Last Frame</summary>

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

</details> 
<details>
  <summary>🦊 RS LoRA Loader</summary>

# 🦊 RS LoRA Loader  
**A powerful, highly customizable node for managing multiple LoRAs. It features a sleek custom interface, a robust preset system, drag-and-drop reordering, and seamless integration with the Civitai API for fetching metadata and trained words.**  

<img width="1078" height="696" alt="Screenshot_2" src="https://github.com/user-attachments/assets/41171801-a066-4f82-8416-dd16d1ad869e" />

### 🎨 Advanced Custom UI  
- **Visual Multi-LoRA Management** - Add, remove, and reorder multiple LoRAs with drag-and-drop support.  
- **Custom CLIP Toggle** - A dedicated, visually distinct button to enable/disable CLIP application per node. When the clip input is turned off, the node operates in the "model only" mode.  
- **Precision Strength Control** - Adjust LoRA strength using `+` / `-` buttons or direct numeric input.  
- **Auto-Resizing & Scrollable List** - The node automatically adjusts its height, with smooth scrolling for long lists.  
- **Quick update** - When adding a new LoRA to the 'loras' folder, you do not need to reload ComfyUI or the browser page. Just click the ✔️ Update LoRA list button.
- **Tag Editing** - Many loras rely on resources other than Civitai. You can register the tags for such loras manually.  

### Adding and Managing LoRAs  
1. Click **➕ Add LoRA** to open the selector. Search or browse the tree, and click a LoRA to add it.  
2. Use the **⋮⋮** handle on the left of each row to drag and drop LoRAs into your desired order.   

### 💾 Preset System  
- **Save & Load** - Save your current LoRA configurations (including strengths and enabled states) as named presets.  
- **Quick Access** - Instantly apply complex LoRA stacks with a single click.  

###  Smart LoRA Selector  
- **Tree View & Search** - Easily find LoRAs using a structured folder tree or a fast, real-time search bar.  
- **Visual Indicators** - Already added LoRAs are marked with a checkmark to prevent duplicates.  

### 🌐 Civitai Metadata Integration (Info Popup)  
- **Instant Info** - Click the `ℹ️` icon on any LoRA row to open a detailed popup.  
- **Fetch from Civitai** - Automatically fetches the model's true name, description, and tags directly from Civitai.  
- **Getting metadata** - If no data is found, click the **🌐 Fetch from Civitai** button.  
   - *Note: This may take a few seconds on the first run.*  
- **Local Caching** - Fetched metadata is saved locally in the `rayko_lora_data` folder. Subsequent views are instant and require no internet connection.  

### 📋 One-Click Tag Copying  
- **Click to Copy** - Click on any individual green tag chip in the Info popup to instantly copy it to your clipboard and auto-close the window.  
- **📋 Copy All** - A dedicated button to copy all trained words/tags at once.

**The principle of adding a tag:**  
One line is one tag.  
If it is written in one line, even separated by commas:  
(1tag, 2tag, 3tag) is one tag.  
If it is written in several lines, there are several tags:  
1tag  
2tag  
3tag  
is three tags.  

### 🔔 Visual Feedback  
- Custom toast notifications for successful actions, errors, and clipboard events.  

</details> 
<details>
  <summary>🦊 RS Models Loader</summary>

# 🦊 RS Models Loader  
**A powerful universal model loading node that combines UNET, CLIP (with additional dual-clip support), VAE and LoRa downloads in a single interface and the function of saving model and LoRA configurations to preset presets.**  

<img width="598" height="644" alt="Screenshot_1" src="https://github.com/user-attachments/assets/b1c9da4a-a505-4694-be28-0024e8241821" />

### 🔥 Features  
- **Unified Loading** - Load UNET, CLIP, VAE, and multiple LoRAs in one node  
- **Dual CLIP Support** - Toggle between single CLIP mode (CLIPLoader) and dual CLIP mode (DualCLIPLoader) for models like Flux, SD3, Hunyuan DiT, and PixArt  
- **Visual Multi-LoRA Management** - Add, remove, and reorder multiple LoRAs with drag-and-drop support. 
- **LoRA Management** - Add, enable/disable, and adjust strengths for multiple LoRAs with an intuitive visual interface  
- **Persistent Storage** - LoRA configurations are saved per node and persist across sessions  
- **Folder Structure** - Browse LoRAs with folder tree navigation  
- **Search Functionality** - Quickly find LoRAs by name  
- **Presets of model sets** - Save model sets to presets for quick switching between models  
- **Presets of LoRA sets** - Save LoRA sets to presets for quick switching between models  
- **Quick update** - When adding a new LoRA to the 'loras' folder, you do not need to reload ComfyUI or the browser page. Just click the ✔️ Update LoRA list button
- **Tag Editing** - Many loras rely on resources other than Civitai. You can register the tags for such loras manually  
- **Pop-up messages** - Confirmation of successful or unsuccessful processes in the node  

### 🌐 Civitai Metadata Integration (Info Popup)  
- **Instant Info** - Click the `ℹ️` icon on any LoRA row to open a detailed popup.  
- **Fetch from Civitai** - Automatically fetches the model's true name, description, and tags directly from Civitai.  
- **Getting metadata** - If no data is found, click the **🌐 Fetch from Civitai** button.  
   - *Note: This may take a few seconds on the first run.*  
- **Local Caching** - Fetched metadata is saved locally in the `rayko_lora_data` folder. Subsequent views are instant and require no internet connection.  

### 📋 One-Click Tag Copying  
- **Click to Copy** - Click on any individual green tag chip in the Info popup to instantly copy it to your clipboard and auto-close the window.  
- **📋 Copy All** - A dedicated button to copy all trained words/tags at once.  

**The principle of adding a tag:**  
One line is one tag.  
If it is written in one line, even separated by commas:  
(1tag, 2tag, 3tag) is one tag.  
If it is written in several lines, there are several tags:  
1tag  
2tag  
3tag  
is three tags.  

### 🔔 Visual Feedback  
- Custom toast notifications for successful actions, errors, and clipboard events. 

### 📃 Notes  
- When dual CLIP mode is disabled, clip_name2 is visible but disabled (grayed out)  
- The node automatically falls back to single CLIP mode if clip_name2 is empty  
- LoRA strengths can be set independently for model and CLIP  
- All settings are saved with your workflow and persist across ComfyUI sessions  

</details> 
<details>
  <summary>🦊 RS Prompts</summary>

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

</details> 
<details>
  <summary>🦊 RS Text Overlay Pro</summary>

# 🦊 RS Text Overlay Pro  
**Interactive ComfyUI node for overlaying text on images with real-time positioning, scaling, rotation, and rich text effects**  

<img width="583" height="876" alt="Screenshot_2" src="https://github.com/user-attachments/assets/0908484b-7e9d-40ed-a122-89990d63e1da" />
<img width="1778" height="1065" alt="Screenshot_1" src="https://github.com/user-attachments/assets/487b77a4-d543-48cd-bd0e-ebf2d1597641" />

### 🔥 Features  
- **Interactive canvas editor** — drag, scale, and rotate text overlay directly on the image  
- **Rich text effects** — Outline, Glow, and Shadow with full parameter control  
- **Hybrid rendering** — instant client-side preview + high-quality server-side final render  
- **Font system** — custom font library with search and live preview  
- **Smart UI** — collapsible sidebar sections with per-effect toggles  
- **Dual modes** — compact widget mode inside the node + full-screen Advanced Mode editor  
- **Color tools** — HEX input with validation + native color picker  
- **Multiline support** — textarea with line spacing and letter spacing controls  
- **Text alignment** — left / center / right with visual icons  
- **State isolation** — each effect can be enabled/disabled independently; disabling resets parameters to defaults

By default, the node is displayed as a standard node with a thumbnail and a minimal set of widgets.  
All changes are immediately displayed.  
Clicking on the "Advanced Mode" button opens a full-screen editor where you can visually manipulate the text.  

## Advanced Mode:  
- The canvas occupies the main part of the screen, with the settings panel on the left/right.  
- The text can be dragged, resized by corners and sides, and rotated using a special pen.  
- All changes are immediately displayed.  

The control panel has sections: TEXT, OUTLINE SETTINGS, GLOW SETTINGS, SHADOW SETTINGS. Each section is collapsible. Controls: text field, sliders, color pickers, alignment and font selection buttons.  

Interactive elements: they are highlighted when hovering, and there are pop-up windows for precise input for numeric values.  

###❗Requirements  
It requires the installation of the pycairo library (just install the dependencies requirements.txt )  
The library is needed for high-quality text rendering and effects.  

### 🔤 Installing Fonts  

Place `.ttf`, `.otf`, or `.ttc` files in folder:  
ComfyUI\custom_nodes\ComfyUI_RaykoStudio\fonts  
Restart ComfyUI  
Fonts are auto-detected on editor open. `Arial.ttf` is used as fallback.  

### 🚀 Usage  

1. Add **🦊 RS Text Overlay Pro** node to your workflow  
2. Connect an image to the `image` input  
3. Run the queue  
4. Configure text, effects, and position  
5. Click **✔️ APPLY** to render the final image  

### Quick start

- Type your text in the **TEXT** section  
- Pick a font and adjust size via the canvas handles  
- Enable effects via toggles in **OUTLINE / GLOW / SHADOW** sections  
- Drag the green bounding box to position the text, turn the image by the orange rotation knob  
- Click **✔️ APPLY** when done  

### ⚙️ Parameters  
### TEXT
| Parameter | Type | Default | Description |
|---|---|---|---|
| Text | textarea | `""` | Multiline text content |
| Font | select | first in library | Font family |
| Text Color | color | `#FFFFFF` | Fill color |
| Text Opacity | slider | `1.0` | `0.0 – 1.0` |
| Line Spacing | slider | `1.0` | `0.5 – 3.0` |
| Letter Spacing | slider | `0.0` | `-20 – 100` |
| Alignment | buttons | center | Left / Center / Right |

### OUTLINE SETTINGS
Enabled automatically when **Thickness > 0**.

| Parameter | Type | Default | Description |
|---|---|---|---|
| Thickness | slider | `0` | `0 – 50` px |
| Color | color | `#808080` | Outline color |
| Opacity | slider | `1.0` | `0.0 – 1.0` |

### GLOW SETTINGS
Toggle **ENABLE GLOW** to activate.

| Parameter | Type | Default | Description |
|---|---|---|---|
| Glow Color | color | `#FFFFFF` | Glow color |
| Size | slider | `100` | `0 – 200` px |
| Spread | slider | `150` | `0 – 300` px |
| Opacity | slider | `1.0` | `0.0 – 1.0` |

### SHADOW SETTINGS
Toggle **ENABLE SHADOW** to activate.

| Parameter | Type | Default | Description |
|---|---|---|---|
| Shadow Color | color | `#333333` | Shadow color |
| Offset X | slider | `10` | `-30 – 30` px |
| Offset Y | slider | `10` | `-30 – 30` px |
| Blur | slider | `15` | `0 – 100` px |
| Opacity | slider | `0.8` | `0.0 – 1.0` |

## ️ Controls

### Normal Mode (inside node)
- **🔍 ADVANCED MODE** button — opens full-screen editor
- **✔️ APPLY** — renders and closes editor
- **❌ CANCEL** — discards changes

### Advanced Mode (full-screen editor)
| Action | Control |
|---|---|
| Move text | Drag inside bounding box |
| Scale | Drag corner/edge handles |
| Rotate | Drag orange handle above box |
| Zoom canvas | Mouse wheel |
| Close editor | `Esc` key |
| Toggle section | Click section header |
| Enable effect | Click toggle in header |

</details> 
<details>
  <summary>🦊 RS Color Picker</summary>

# 🦊 RS Color Picker  
**Professional color picker node with advanced features including eyedropper, color history and presets**  

<img width="412" height="667" alt="Screenshot_1" src="https://github.com/user-attachments/assets/13c817b7-28c8-414c-9f3c-39494c9e468a" />

### 🔥 Features  
- **Visual Color Picker** - Intuitive color selection with live preview  
- **Eyedropper Tool** - Pick colors from anywhere on screen (Chrome/Edge) or from ComfyUI canvas (all browsers)  
- **Copy to Clipboard** - Click Copy button next to the HEX values window  
- **Basic Colors** - 8 preset colors for quick access  
- **Recent Colors** - History of last 24 used colors (saved in localStorage)  
- **Multiple Outputs** - HEX_INT, HEX_STR, and RGB formats  
- **Presets** - Saving color history to preset, loading saved presets  
- **Clean All** - The '❌ Clear All' button clears the panel of all colors
- **Delete button** - Appears by right-clicking on any color in the panel and deletes the selected color when clicked  

### 🪛 Usage  
1. **Select a color using one of these methods:**  
- Click the color swatch to open native color picker  
- Click the palette icon (🎨) to activate eyedropper tool  
- Click any preset color from the "Basic Colors" row  
- Click any color from the "Recent Colors" history  
- Type HEX value directly into the input field  

2. **Connect outputs to other nodes:**  
`HEX_INT` - Integer value (e.g., 16711680 for #FF0000)  
`HEX_STR` - HEX string (e.g., "#FF0000")  
`RGB` - Normalized RGB values (e.g., "1.000, 0.000, 0.000")  

</details> 
<details>
  <summary>🦊 RS Saturation</summary>
	
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

</details> 
<details>
  <summary>🦊 RS Save Image</summary>

# 🦊 RS Save Image  
**Node for adding explanatory text to an image**  

![Screenshot_7](https://github.com/user-attachments/assets/0e1a41f9-2d07-4bd7-892a-a377a8a975f9)

### 🔥 Features  
The node is used to save the image while preserving the workflow inside the image. You can add explanatory text to an image with a choice of background size, theme, font and its size. It is possible to add your own fonts (to the fonts folder). Use ttf and otf fonts.  
If the label is not needed, leave the text field blank and the image is saved as usual.  
Themes:  
light - white background, black text.  
dark - black background, white text.  

</details> 
<details>
  <summary>🦊 RS Save Image Pair</summary>

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

</details> 
<details>
  <summary>🦊 RS Image-Text</summary>

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

</details> 
<details>
  <summary>🦊 RS Loop Switch</summary>

# 🦊 RS Loop Switch  
**A combined node for generating a sequence of values with automatic switching**  

![Screenshot_1](https://github.com/user-attachments/assets/4e11bde0-55f8-4879-9290-b50ae452c55a)

### 🔥 Features  
The node generates a list of INT values, automatically switching between 10 preset values based on the current cycle step. It is ideal for generating a series of images with different seeds without the need to manually change the parameters. But you can use it for any other tasks where dynamic INT changes are required.  

### 🔌 Connection (examples)  
- RS Loop Switch (output) → KSampler (seed)  
- RS Loop Switch (output) → KSampler (steps)  
- RS Loop Switch (output) → any INT input  

</details>
<details>
  <summary>🦊 ComfyUI Settings Manager</summary>

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

</details>

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
