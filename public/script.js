document.addEventListener("DOMContentLoaded", () => {
  const searchForm = document.getElementById("searchForm");
  const keywordInput = document.getElementById("keywordInput");
  const searchBtn = document.getElementById("searchBtn");
  const clearBtn = document.getElementById("clearBtn");
  const urlList = document.getElementById("urlList");
  const savedList = document.getElementById("savedList");
  const contentViewer = document.getElementById("contentViewer");
  const messageArea = document.getElementById("messageArea");
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const progressSize = document.getElementById("progressSize");
  const originalLink = document.getElementById("originalLink");

  // Загрузка сохраненных страниц при запуске
  loadSavedPages();

  // Обработчик формы поиска
  searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const keyword = keywordInput.value.trim();

    if (!keyword) {
      showMessage("Введите ключевое слово для поиска", "error");
      return;
    }

    try {
      searchBtn.disabled = true;
      searchBtn.innerHTML = "<span>Поиск...</span>";

      // Запрос к серверу для получения URL
      const response = await fetch(
        `/api/urls?keyword=${encodeURIComponent(keyword)}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при поиске URL");
      }

      const urls = await response.json();

      // Очистка списка перед добавлением новых URL
      urlList.innerHTML = "";

      if (urls.length === 0) {
        urlList.innerHTML = '<li class="placeholder">URL не найдены</li>';
        showMessage("По вашему запросу ничего не найдено", "info");
      } else {
        urls.forEach((url) => {
          const li = document.createElement("li");
          li.textContent = url;
          li.addEventListener("click", () => downloadContent(url, li));
          urlList.appendChild(li);
        });
      }
    } catch (error) {
      console.error("Ошибка поиска:", error);
      showMessage(error.message, "error");
    } finally {
      searchBtn.disabled = false;
      searchBtn.innerHTML = "<span>Поиск</span>";
    }
  });

  // Обработчик кнопки очистки
  clearBtn.addEventListener("click", () => {
    keywordInput.value = "";
    urlList.innerHTML =
      '<li class="placeholder">Введите ключевое слово для поиска</li>';
    messageArea.innerHTML = "";
  });

  // Функция загрузки контента
  function downloadContent(url, listItem) {
    if (
      listItem.classList.contains("downloading") ||
      listItem.classList.contains("downloaded")
    ) {
      return;
    }

    listItem.classList.add("downloading");
    listItem.textContent = `Загрузка: ${url}`;

    progressContainer.style.display = "block";
    progressBar.style.width = "0%";
    progressText.textContent = "0%";
    progressSize.textContent = "0 KB / 0 KB";

    const eventSource = new EventSource(
      `/api/download?url=${encodeURIComponent(url)}`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "size":
          // Размер файла известен
          break;

        case "progress":
          // Обновление прогресса
          const loaded = data.payload.loaded;
          const total = data.payload.total;
          const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;

          progressBar.style.width = `${percent}%`;
          progressText.textContent = `${percent}%`;
          progressSize.textContent = `${formatSize(loaded)} / ${formatSize(
            total
          )}`;
          break;

        case "done":
          // Загрузка завершена
          eventSource.close();
          listItem.classList.remove("downloading");
          listItem.classList.add("downloaded");
          listItem.textContent = url;

          // Сохранение страницы
          savePage(url, data.payload);
          showMessage(
            "Страница успешно загружена и сохранена в избранное",
            "success"
          );
          progressContainer.style.display = "none";
          break;

        case "error":
          // Ошибка
          eventSource.close();
          listItem.classList.remove("downloading");
          listItem.textContent = url;
          showMessage(data.payload, "error");
          progressContainer.style.display = "none";
          break;
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      listItem.classList.remove("downloading");
      listItem.textContent = url;
      showMessage("Ошибка при загрузке контента", "error");
      progressContainer.style.display = "none";
    };
  }

  // Функция сохранения страницы
  function savePage(url, content) {
    let savedPages = JSON.parse(localStorage.getItem("savedPages") || "[]");

    if (savedPages.some((page) => page.url === url)) {
      return;
    }

    savedPages.push({
      url: url,
      content: content,
      date: new Date().toISOString(),
    });

    localStorage.setItem("savedPages", JSON.stringify(savedPages));
    loadSavedPages();
  }

  // Функция загрузки сохраненных страниц
  function loadSavedPages() {
    const savedPages = JSON.parse(localStorage.getItem("savedPages") || "[]");

    savedList.innerHTML = "";

    if (savedPages.length === 0) {
      savedList.innerHTML =
        '<li class="placeholder">Нет сохраненных страниц</li>';
      return;
    }

    savedPages.forEach((page) => {
      const li = document.createElement("li");
      li.innerHTML = `
                ${page.url}
                <button class="delete-btn" data-url="${page.url}">×</button>
            `;

      li.addEventListener("click", () => {
        displaySavedPage(page);
      });

      savedList.appendChild(li);
    });

    // Обработчики для кнопок удаления
    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteSavedPage(btn.dataset.url);
      });
    });
  }

  // Функция удаления сохраненной страницы
  function deleteSavedPage(url) {
    let savedPages = JSON.parse(localStorage.getItem("savedPages") || "[]");
    savedPages = savedPages.filter((page) => page.url !== url);
    localStorage.setItem("savedPages", JSON.stringify(savedPages));
    loadSavedPages();

    // Если удаляем текущую просматриваемую страницу, очищаем viewer
    if (originalLink.href === url) {
      contentViewer.srcdoc = `
                <html>
                    <body style='display: flex; justify-content: center; align-items: center; height: 100%; color: #666;'>
                        <p>Страница для просмотра не выбрана</p>
                    </body>
                </html>
            `;
      originalLink.style.display = "none";
    }

    showMessage("Страница удалена из избранного", "success");
  }

  // Функция отображения сохраненной страницы
  function displaySavedPage(page) {
    contentViewer.srcdoc = page.content;
    originalLink.href = page.url;
    originalLink.style.display = "inline";
  }

  // Функция показа сообщений
  function showMessage(message, type) {
    messageArea.innerHTML = `
            <div class="message ${type}">
                ${message}
            </div>
        `;

    // Автоматическое скрытие сообщения через 5 секунд
    setTimeout(() => {
      messageArea.innerHTML = "";
    }, 5000);
  }

  // Функция форматирования размера
  function formatSize(bytes) {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
});
