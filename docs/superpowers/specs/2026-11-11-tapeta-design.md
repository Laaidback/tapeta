# Tapeta — wizualizacja tapety na zdjęciu pokoju

Data: 2026-11-11

## Cel

Strona w przeglądarce dla jednej użytkowniczki (sprzedaje tapety). Wrzuca zdjęcie pokoju
od klienta, zaznacza ścianę, wrzuca zdjęcie tapety i dostaje obraz „jak to będzie wyglądać”,
który zapisuje albo wysyła klientowi.

Użytkowniczka nie jest techniczna. Interfejs po polsku, duże przyciski, obsługa głównie
palcem na telefonie; działa też na komputerze z myszą.

## Zakres

W zakresie:

- wczytanie zdjęcia pokoju i zdjęcia tapety (aparat albo galeria),
- zaznaczenie ściany czterema rogami, tapeta w perspektywie,
- dwa tryby tapety: wzór powtarzany i fototapeta,
- automatyczna maska po kolorze ściany,
- gumka i pędzel do poprawek, w tym „mądra gumka”,
- zachowanie cieni i światła ze zdjęcia,
- podgląd „Przed / Po”, zapis i udostępnienie wyniku.

Poza zakresem: wykrywanie ściany lub mebli modelem ML, kilka ścian na jednym zdjęciu,
zapisywanie projektów, katalog tapet, konta, serwer, tryb offline (PWA).

## Architektura

Statyczna strona bez kroku budowania i bez zależności: `index.html`, `style.css` i moduły ES
w `src/`. Hosting: GitHub Pages z publicznego repo `Laaidback/tapeta`. Zdjęcia są
przetwarzane wyłącznie w przeglądarce i nigdzie nie są wysyłane.

Rysowanie w WebGL (jeden `<canvas>`): jeden przebieg fragment shadera składa zdjęcie pokoju,
tapetę i maski. Zapis wyniku to ten sam shader narysowany w rozdzielczości zdjęcia pokoju.

### Moduły

| Plik | Odpowiedzialność | Zależy od |
|---|---|---|
| `src/homography.js` | Czyste funkcje: macierz 3×3 z czterech par punktów, wypukłość czworokąta, szacowane proporcje ściany z czworokąta | — |
| `src/color.js` | Czyste funkcje: RGB → YCbCr, mediana koloru ściany z próbek, odległość koloru | — |
| `src/images.js` | Wczytanie pliku (`createImageBitmap(file, { imageOrientation: 'from-image' })` — obrót EXIF robi przeglądarka, bez własnego parsera), zmniejszenie do 2000 px po dłuższym boku, piksele zdjęcia pokoju jako `ImageData` | — |
| `src/mask.js` | Maska ręczna (`Uint8Array`): pociągnięcia gumki i pędzla, mądra gumka, stos cofania | `color.js` |
| `src/renderer.js` | WebGL: tekstury, shader, rysowanie podglądu i eksport do PNG/JPEG | `homography.js` |
| `src/layout.js` | Czyste funkcje: dopasowanie zdjęcia do ekranu, powiększanie widoku, powtórzenia wzoru, kadr fototapety, nazwa pliku | — |
| `src/app.js` | Stan aplikacji, kroki, pętla rysowania | wszystkie |
| `src/corners.js`, `src/controls.js`, `src/paint.js`, `src/output.js` | Interfejs kolejnych kroków: rogi i lupa, suwaki tapety, gumka i gesty, zapis i udostępnianie | `app.js` przez wspólny kontekst |
| `src/demo.js` | Tylko `?demo`: sztuczne zdjęcie pokoju i tapety do weryfikacji bez wybierania plików | `app.js` |

Stan aplikacji to jeden obiekt: zdjęcie pokoju, zdjęcie tapety, cztery rogi (w układzie
zdjęcia pokoju, 0–1; uchwyt poza zdjęciem: −0,2…1,2), tryb tapety, wartości suwaków, kolor
odniesienia ściany, maska ręczna, przesunięcie i powiększenie widoku.
Każda zmiana stanu wywołuje jedno przerysowanie.

## Przebieg

Pasek kroków u góry, „Dalej” / „Wstecz” na dole. Można wracać do wcześniejszych kroków bez
utraty późniejszych ustawień.

1. **Zdjęcie pokoju.** Jeden przycisk „Wybierz zdjęcie pokoju” (`<input type="file"
   accept="image/*">` — system proponuje aparat albo galerię).
2. **Zaznacz ścianę.** Cztery uchwyty na rogach, startowo prostokąt 15% od krawędzi zdjęcia.
   Przeciąganie uchwytu pokazuje lupę (powiększenie 3×) nad palcem. Uchwyt można wyciągnąć
   poza zdjęcie (do 20% wymiaru), bo róg ściany bywa poza kadrem. Czworokąt musi być wypukły;
   ruch, który by to złamał, jest ignorowany.
3. **Tapeta.** Przycisk „Wybierz zdjęcie tapety”. Przełącznik „Wzór powtarzany / Fototapeta”
   (domyślnie wzór). Suwaki opisane niżej. Podgląd od razu z automatyczną maską.
4. **Popraw.** Narzędzia: „Gumka” (zdejmuje tapetę), „Pędzel” (przywraca tapetę), przełącznik
   „Mądra gumka” (domyślnie wł.), suwak rozmiaru, „Cofnij”. Dwa palce przesuwają i powiększają
   widok; jeden palec maluje. Drugi palec w trakcie pociągnięcia anuluje je (maska wraca do
   stanu sprzed pociągnięcia).

W krokach 3 i 4: przycisk „Przed / Po” (przytrzymanie pokazuje oryginał), „Zapisz zdjęcie”
i „Udostępnij” — nieaktywne, dopóki nie ma zdjęcia tapety.

## Tapeta na ścianie

Homografia mapuje punkt zdjęcia pokoju na współrzędne ściany (u, v) w zakresie 0–1. Shader
dla każdego piksela liczy (u, v); poza zakresem zostaje oryginalne zdjęcie.

Proporcje ściany (szerokość / wysokość) są szacowane z czworokąta: średnia długość krawędzi
górnej i dolnej przez średnią lewej i prawej, liczone w pikselach zdjęcia (nie w 0–1). Suwak „Proporcje ściany” (0,5×–2× szacunku,
domyślnie 1×) pozwala poprawić zniekształcenie.

- **Wzór powtarzany:** suwak „Wielkość wzoru” ustawia liczbę powtórzeń w poziomie (1–20,
  domyślnie 6). Liczba powtórzeń w pionie wynika z proporcji ściany i proporcji zdjęcia
  tapety, tak aby wzór nie był rozciągnięty. Tekstura z zawijaniem `REPEAT`; zdjęcie tapety
  jest wcześniej skalowane do wymiarów będących potęgą dwójki (wymóg WebGL 1 dla `REPEAT`),
  z mipmapami (`LINEAR_MIPMAP_LINEAR`), żeby gęsty wzór pod kątem nie migotał. Zdjęcie, które
  nie jest bezszwowym kafelkiem, pokaże szwy — ograniczenie, nie błąd.
- **Fototapeta:** jeden obraz wypełnia ścianę z zachowaniem proporcji (przycięcie do środka,
  jak `object-fit: cover`).

## Światło

Kolor wynikowy = kolor tapety × jasność tapety × współczynnik cienia.

Współczynnik cienia = `mix(1, L / L_ref, siła)`, gdzie `L` to jasność piksela zdjęcia pokoju,
`L_ref` to 90. percentyl jasności ściany (ściana w świetle — tapeta ciemnieje w cieniu,
ale nie prześwietla się w jasnej połowie), a `siła` pochodzi z suwaka „Siła cieni” (0–100%,
domyślnie 70%). Współczynnik jest ograniczony do zakresu 0,2–1,2. Suwak „Jasność tapety”:
50–150%, domyślnie 100%.

## Maski

Krycie tapety w pikselu = wewnątrz czworokąta × maska automatyczna, z nadpisaniem przez
maskę ręczną.

**Kolor odniesienia ściany.** Po kroku 2 (i po każdej zmianie rogów) aplikacja pobiera
siatkę 32×32 próbek ze środkowych 80% czworokąta (próbki poza zdjęciem pomijane) i liczy
medianę Y, Cb, Cr (kolor odniesienia maski) oraz 90. percentyl Y (`L_ref`). Mediana jest odporna na meble zajmujące mniej niż połowę ściany.

**Odległość koloru** — jedna definicja, w `color.js` i w shaderze: w YCbCr (BT.601, składowe
0–1) `d = length(ΔCb, ΔCr) + 0,25 · |ΔY|`. Cień na ścianie zmienia głównie Y, więc nie robi
dziury.

**Maska automatyczna** (liczona w shaderze). Krycie = `1 − smoothstep(próg, próg + 0,03, d)`
dla odległości od koloru odniesienia. Suwak „Czułość” (0–100%, domyślnie 50%): wyższa czułość
= niższy próg = tapeta schodzi z większej liczby pikseli. Próg liniowo od 0,30 (1%) do 0,03
(100%); 0% wyłącza maskę automatyczną (tapeta na całym czworokącie). Wartości startowe, do
strojenia na prawdziwych zdjęciach.

**Maska ręczna.** `Uint8Array` w rozdzielczości zdjęcia pokoju, przesyłana jako tekstura
`LUMINANCE` (po pociągnięciu `texSubImage2D` tylko zmienionego prostokąta). Wartość 128 = „bez zmian” (decyduje maska automatyczna), 0 = tapeta zdjęta,
255 = tapeta wymuszona. Shader miesza liniowo, więc miękki brzeg pędzla daje miękkie przejście.

**Mądra gumka.** Przy starcie pociągnięcia zapamiętywany jest kolor zdjęcia pokoju pod
środkiem pędzla. Pociągnięcie zmienia tylko piksele, których odległość koloru od
zapamiętanego jest mniejsza od stałego progu 0,08 (do strojenia). Działa tak samo dla pędzla przywracającego.
Wyłączenie przełącznika daje zwykły okrągły pędzel.

**Cofanie.** Stos do 20 kroków; krok = jedno pociągnięcie (zapis fragmentu maski objętego
pociągnięciem). Zmiana rogów ściany nie kasuje maski ręcznej.

## Zapis i udostępnianie

- „Zapisz zdjęcie”: eksport JPEG (jakość 0,92) w rozdzielczości zdjęcia pokoju (kanwa WebGL chwilowo
  w rozmiarze zdjęcia, kopia przez `drawImage` na kanwę 2D), pobranie pliku `tapeta-RRRR-MM-DD-GGMM.jpg`. Na iPhonie plik
  trafia do „Plików”; do galerii prowadzi „Udostępnij”.
- „Udostępnij”: `navigator.share({ files })`. Przycisk ukryty, gdy przeglądarka nie obsługuje
  udostępniania plików (`navigator.canShare`).

## Błędy

- Plik nie jest obrazem albo nie daje się zdekodować: komunikat „Nie udało się otworzyć
  zdjęcia. Spróbuj innego.”; stan bez zmian.
- Brak WebGL: komunikat na całą stronę „Ta przeglądarka nie obsługuje podglądu. Otwórz stronę
  w Chrome albo Safari.”
- Utrata kontekstu WebGL: ponowne utworzenie tekstur ze stanu i przerysowanie.
- Odświeżenie strony kasuje pracę; przed zamknięciem karty z wczytanym zdjęciem przeglądarka
  pyta o potwierdzenie (`beforeunload`; na telefonach działa nie zawsze).

## Testy i weryfikacja

- Testy jednostkowe (`node --test`, bez zależności; `package.json` z `"type": "module"`) dla `homography.js` i `color.js`:
  odwzorowanie czterech rogów na kwadrat jednostkowy, wypukłość, czworokąt zdegenerowany,
  mediana koloru, odległość koloru przy zmianie samej jasności.
- Weryfikacja ręczna w przeglądarce przez lokalny serwer HTTP (moduły nie działają z
  `file://`; widok telefonu 375×812 i komputer) na przykładowych
  zdjęciach: pusta ściana, ściana z kanapą i lampą, ściana z oknem, zdjęcie pod kątem;
  oba tryby tapety; eksport ma rozdzielczość zdjęcia pokoju i wygląda jak podgląd.

## Możliwy kolejny etap

„Dotknij mebel”: segmentacja modelem w przeglądarce (MediaPipe Interactive Segmenter).
Dopiero po sprawdzeniu, czy maska po kolorze i mądra gumka wystarczają na prawdziwych
zdjęciach od klientów.

## Ściana ze wzorem (2026-11-13)

Na ścianie ze starą tapetą automatyczna maska koloru robi dziury, a cieniowanie z luminancji zdjęcia przebija stary wzór przez nową tapetę. Przełącznik „Ściana ma wzór (stara tapeta)” w kroku „Tapeta” (domyślnie wyłączony):

- wyłącza automatyczną maskę (suwak „Czułość” nieaktywny); meble wymazuje się gumką w kroku „Popraw”,
- cieniowanie bierze jasność z rozmytej mapy (`src/light.js`): siatka 96 komórek na dłuższym boku, rozmycie pudełkowe o promieniu 4 komórek, 3 przebiegi, ważone — komórki poza czworokątem ściany i wymazane w masce nie wchodzą do średniej, więc wymazany mebel nie zostawia ciemnej poświaty,
- jasność oświetlonej ściany (`uLight`) to 90. percentyl tej mapy,
- mapa liczy się ponownie po zmianie rogów, po każdym pociągnięciu gumki i po „Cofnij”.

Demo: `?demo=3&wall=pattern`.

## Dwie ściany w narożniku (2026-11-13)

Tapeta na dwóch prostopadłych ścianach. W kroku „Ściana” przycisk „Dodaj drugą ścianę” / „Usuń drugą ścianę”:

- 6 punktów: pierwsza ściana jest lewa (`corners`), druga (`corners2`) dzieli z nią krawędź narożnika (`corners2[0]` = `corners[1]`, `corners2[3]` = `corners[2]`). Geometria w `src/walls.js`. Nowa ściana przedłuża pierwszą w prawo; gdy brak miejsca, pierwsza dzieli się na pół.
- Shader ma drugą homografię. Współrzędna x biegnie przez obie ściany (`uSplit` = udział pierwszej w łącznej szerokości), więc wzór i fototapeta przechodzą przez narożnik bez przerwy. Wspólna krawędź jest twarda, bez wygaszania.
- Szerokości ścian z `wallAspect` każdego czworokąta; suwak „Szerokość drugiej ściany” (40–250%) poprawia szacunek. „Wielkość wzoru” liczy powtórzenia na łącznej szerokości.
- Maska koloru: osobny kolor odniesienia dla każdej ściany (`uRef`, `uRef2`). Jasność odniesienia wspólna (większa z dwóch), więc ciemniejsza ściana dostaje ciemniejszą tapetę i narożnik zostaje widoczny.
- „Ściana ma wzór”: mapa jasności liczona z obu czworokątów.

Poza zakresem: ściany, które się nie stykają; więcej niż jeden narożnik. Demo: `?demo=3&wall=corner`.
