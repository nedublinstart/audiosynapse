/** Shared upload accept strings — keep in sync with backend ALLOWED_* sets. */

export const AUDIO_ACCEPT =
  ".mp3,.wav,.m4a,.m4b,.ogg,.oga,.opus,.aac,.flac,.wma,.amr,.mp4,.webm,.3gp,.aiff,.mkv,audio/*";

export const MATERIAL_ACCEPT =
  ".pdf,.pptx,.ppt,.docx,.odt,.rtf,.txt,.md,.html,.htm,.csv,.xlsx,.xls," +
  ".png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.heic,image/*";

export const MATERIAL_HINT =
  "PDF, Word, PowerPoint, таблицы, текст, изображения · до 500 МБ";

export const MAX_UPLOAD_MB = 500;

export const AUDIO_HINT = "mp3, wav, m4a, ogg, opus, aac, flac и другие · до 500 МБ";
