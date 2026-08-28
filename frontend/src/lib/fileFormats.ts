/** Shared upload accept strings — keep in sync with backend ALLOWED_* sets. */

export const AUDIO_ACCEPT =
  ".mp3,.wav,.m4a,.m4b,.ogg,.oga,.opus,.aac,.flac,.wma,.amr,.mp4,.webm,.3gp,.aiff,.mkv,.mov,.avi,.m4v,audio/*,video/*";

export const MATERIAL_ACCEPT =
  ".pdf,.pptx,.ppt,.docx,.odt,.rtf,.txt,.md,.html,.htm,.csv,.xlsx,.xls," +
  ".png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.heic,image/*";

export const MATERIAL_HINT =
  "PDF, Word, PowerPoint, таблицы, текст, изображения слайдов";

export const MEDIA_HINT =
  "Аудио или видео (mp3, wav, mp4, webm…) · до 500 МБ · звук из видео извлекается на сервере";

/** @deprecated use MEDIA_HINT */
export const AUDIO_HINT = MEDIA_HINT;
