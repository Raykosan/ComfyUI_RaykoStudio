# 🦊 ComfyUI_RaykoStudio  
ComfyUI_RaykoStudio — a set of custom nodes for ComfyUI providing additional image processing capabilities  

# 🦊 RaykoStudio Saturation Switch Node for ComfyUI  
**Professional image saturation control with artifact and highlight protection.**  

![Demo](web/RS-SaturationNode.png)  

---

## 🔥 Features  

- **Smooth adjustment** with 0.05 steps  
- **Smart boosting** without overexposure  
- **Artifact protection** even at extreme values  
- **Batch processing** optimized  
- **Supports**: Windows/Linux · Python 3.11+ · PyTorch 2.0+  

---  

## 🛠 Installation  

- Clone repository to `ComfyUI/custom_nodes/` folder:  
```
git clone https://github.com/Raykosan/ComfyUI_RS-SaturationNode.git  

```
- Copy ComfyUI_RS-SaturationNode folder to: ComfyUI/custom_nodes/  
- You can install this node using the ComfyUI_Manager  

## 🎛 Usage  

🦊 RS Safe Saturation  
| Range      | Processing Type               | Use Case                     |
|------------|-------------------------------|-----------------------------|
| 0.0-0.9    | Toning/desaturation           | Gradual color removal       |
| 1.0-1.3    | Natural enhancement           | Recommended range           |
| 1.3-2.0    | Vibrant artistic effects      | Stylization                 |
| 2.0-3.0    | Maximum saturation            | Cinematic effects           |

## ⚙️ Technical Details  

Algorithm workflow:  

Luminance space conversion  

Non-linear adjustment:  
Values <1.0: Linear interpolation  
Values >1.0: Adaptive S-curve  

Auto highlight recovery  

Recommended settings:  
| Intensity  | Effect                          |
|------------|---------------------------------|
| 0.0-0.9    | Toning/desaturation             |
| 1.0-1.3    | Natural enhancement (recommended) |
| 1.3-2.0    | Vibrant artistic effects        |
| 2.0-3.0    | Cinematic saturation           |
	
# Save Image Pair node  
![Save Image Pair](https://github.com/user-attachments/assets/43fb95d6-3213-4c31-bb09-a722b463c62b)
(EN) The "Save Image Pair" node is used to save the source and destination images in a single image while preserving the workflow within the image. It is convenient for visual understanding of the workflow contained in the image.   
Usage: place the file "Rayko_Save_Image_Pair.py" to the folder "...ComfyUI/custom_nodes" and restart ComfyUI if it was already running. 
It is better to choose horizontal saving for portraits, and vertical saving for landscapes. The color is made to fill the empty space that is formed with different sizes of images. 
Usage: place the file "Rayko_Save_Image_Pair.py " to the folder "...ComfyUI/custom_nodes" and restart ComfyUI if it was already running.  

(RU) Нода "Save Image Pair" используется для сохранения исходного и конечного изображения в одном изображении с сохранением рабочего процесса внутри изображения. Удобно для визуального понимания содержащегося в изображении воркфлоу. 
Для портретов лучше выбирать горизонтальное сохранение, для лэндскейпов - вертикальное. Цвет сделан для заполнения пустующего места, которое образуется при разных размерах картинок.  
Использование: поместите файл "Rayko_Save_Image_Pair.py" в папку "...ComfyUI/custom_nodes" и перезапустите ComfyUI если он был уже запущен.  

# Image Text node  
![Screenshot_4](https://github.com/user-attachments/assets/0403a04c-df9e-4433-9239-c4b72fc893b5)  
(EN) The Image-Text node writes any hidden text to any png and jpeg file (jpeg is converted to png). And outputs text from images recorded in this way. You can use it instead of a Load Image (without a mask) and transfer the recorded text to the promt node. It is useful if there is an image and a shortcut to it, but the image does not contain a workflow (often found on the site civitai.com).  
Two modes:  
Write - writes text to the uploaded image and saves it to the output folder with the prefix you specified.  
Read - reads the text you wrote earlier in the uploaded image, sends the text and images further according to the scheme.  
Usage: place the file "Rayko_Image_Text.py " to the folder "...ComfyUI/custom_nodes" and restart ComfyUI if it was already running

(RU) Нода Image-Text записывает любой текст в любой файл формата png и jpeg (jpeg преобразуется в png) в скрытом виде и выводит из изображений текст, записанный таким способом. Вы можете использовать ноду вместо ноды Load Image (без маски) и передавать прочитанный текст в ноду prompt. Это полезно, если есть изображение и промпт к нему, но само изображение не содержит рабочего процесса (часто встречается на сайте civitai.com).  
Два режима:  
Write - записывает скрытый текст в загруженное изображение и сохраняет его в папку output с указанным вами префиксом.  
Read - читает текст записанный вами ранее из загруженного изображения, и отправляет текст и изображение далее по схеме.  
Использование: поместите файл "Rayko_Image_Text.py " в папку "...ComfyUI/custom_nodes" и перезапустите ComfyUI если он был уже запущен.

Ссылка на видео https://youtu.be/1s26hUcVXX4 

## 🤝 Bug Reporting  

If you encounter an issue or find a bug:  

Check Issues section on GitHub, maybe problem is already known.  
If new problem, create new Issue describing:  

- ComfyUI and Python versions  
- Problem description and reproduction steps  
- Screenshots or error logs (if available)  

## 📜 License  

MIT License. Use node at your own risk without any warranties.  

## ❤️ Acknowledgments  

Thanks to ComfyUI community for inspiration and support! If you like this node, don't forget to star on GitHub!
