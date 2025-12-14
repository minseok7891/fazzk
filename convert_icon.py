from PIL import Image
import os

# PNG 파일 로드
img = Image.open('public/dodoroi_icon.png')

# 1. 개별 PNG 생성
sizes = [32, 128, 256, 512]
for size in sizes:
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(f'src-tauri/icons/{size}x{size}.png')
    print(f'{size}x{size}.png 생성 완료')

# 128x128@2x.png (256x256과 동일)
img.resize((256, 256), Image.Resampling.LANCZOS).save('src-tauri/icons/128x128@2x.png')
print('128x128@2x.png 생성 완료')

# 2. ICO 파일 생성 (모든 사이즈 포함)
# Windows는 16, 32, 48, 64, 128, 256 사이즈를 아이콘 파일 하나에 포함하는 것을 권장
icon_sizes = [(16,16), (32,32), (48,48), (64,64), (128,128), (256,256)]
img.save('src-tauri/icons/icon.ico', format='ICO', sizes=icon_sizes)
print('icon.ico 생성 완료 (16~256 사이즈 포함)')

# 3. icon.png (주 아이콘, 보통 512 권장)
img.resize((512, 512), Image.Resampling.LANCZOS).save('src-tauri/icons/icon.png')
print('icon.png 생성 완료')

# 4. Windows용 추가 아이콘 (StoreLogo, SquareLogo 등)
# 기존에 존재하는 파일들을 덮어쓰기 위해 리스트업
windows_icons = [
    ('StoreLogo.png', 50),
    ('Square30x30Logo.png', 30),
    ('Square44x44Logo.png', 44),
    ('Square71x71Logo.png', 71),
    ('Square89x89Logo.png', 89),
    ('Square107x107Logo.png', 107),
    ('Square142x142Logo.png', 142),
    ('Square150x150Logo.png', 150),
    ('Square284x284Logo.png', 284),
    ('Square310x310Logo.png', 310)
]

for name, size in windows_icons:
    try:
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(f'src-tauri/icons/{name}')
        print(f'{name} 생성 완료')
    except Exception as e:
        print(f'{name} 생성 실패: {e}')


