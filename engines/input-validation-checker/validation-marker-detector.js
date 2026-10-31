'use strict';

const fs = require('node:fs/promises');

const CLASS_VALIDATOR_MARKERS = Object.freeze([
  ['ArrayNotEmpty', /@\s*ArrayNotEmpty\b/],
  ['IsBoolean', /@\s*IsBoolean\b/],
  ['IsDateString', /@\s*IsDateString\b/],
  ['IsEmail', /@\s*IsEmail\b/],
  ['IsEnum', /@\s*IsEnum\b/],
  ['IsNumber', /@\s*IsNumber\b/],
  ['IsOptional', /@\s*IsOptional\b/],
  ['IsString', /@\s*IsString\b/],
  ['IsUUID', /@\s*IsUUID\b/],
  ['Length', /@\s*Length\b/],
  ['Matches', /@\s*Matches\b/],
  ['Max', /@\s*Max\b/],
  ['Min', /@\s*Min\b/],
  ['ValidateNested', /@\s*ValidateNested\b/]
]);

const CLASS_TRANSFORMER_MARKERS = Object.freeze([
  ['Transform', /@\s*Transform\b/],
  ['Type', /@\s*Type\b/],
  ['plainToInstance', /\bplainToInstance\b/]
]);

const HANDLER_PIPE_MARKERS = Object.freeze([
  ['DefaultValuePipe', /\bDefaultValuePipe\b/],
  ['ParseArrayPipe', /\bParseArrayPipe\b/],
  ['ParseBoolPipe', /\bParseBoolPipe\b/],
  ['ParseIntPipe', /\bParseIntPipe\b/],
  ['ParseUUIDPipe', /\bParseUUIDPipe\b/],
  ['UsePipes', /@\s*UsePipes\b/],
  ['ValidationPipe', /\bValidationPipe\b/]
]);

const FILE_VALIDATION_MARKERS = Object.freeze([
  ['FileTypeValidator', /\bFileTypeValidator\b/],
  ['MaxFileSizeValidator', /\bMaxFileSizeValidator\b/],
  ['ParseFilePipe', /\bParseFilePipe(?:Builder)?\b/],
  ['fileFilter', /\bfileFilter\b/],
  ['limits', /\blimits\b/],
  ['maxCount', /\bFilesInterceptor\s*\([^,]+,\s*\d+/]
]);

const UPLOAD_INTERCEPTOR_MARKERS = Object.freeze([
  ['AnyFilesInterceptor', /\bAnyFilesInterceptor\b/],
  ['FileFieldsInterceptor', /\bFileFieldsInterceptor\b/],
  ['FileInterceptor', /\bFileInterceptor\b/],
  ['FilesInterceptor', /\bFilesInterceptor\b/]
]);

const GLOBAL_VALIDATION_PIPE_PATTERN = /\buseGlobalPipes\s*\([\s\S]*?\bValidationPipe\b/;
const NEW_VALIDATION_PIPE_PATTERN = /\bnew\s+ValidationPipe\b/;

function detectNamedMarkers(text, rules) {
  const source = String(text || '');
  const markers = [];

  for (const [marker, pattern] of rules) {
    if (pattern.test(source)) {
      markers.push(marker);
    }
  }

  return Array.from(new Set(markers)).sort((left, right) => left.localeCompare(right));
}

function detectClassValidatorMarkers(text) {
  return detectNamedMarkers(text, CLASS_VALIDATOR_MARKERS);
}

function detectClassTransformerMarkers(text) {
  return detectNamedMarkers(text, CLASS_TRANSFORMER_MARKERS);
}

function detectHandlerPipeMarkers(text) {
  return detectNamedMarkers(text, HANDLER_PIPE_MARKERS);
}

function detectFileValidationMarkers(text) {
  return detectNamedMarkers(text, FILE_VALIDATION_MARKERS);
}

function detectUploadInterceptorMarkers(text) {
  return detectNamedMarkers(text, UPLOAD_INTERCEPTOR_MARKERS);
}

function detectGlobalValidationPipe(text) {
  const source = String(text || '');
  return GLOBAL_VALIDATION_PIPE_PATTERN.test(source) || NEW_VALIDATION_PIPE_PATTERN.test(source);
}

function lineNumberForPattern(text, pattern) {
  const source = String(text || '');
  const match = source.match(pattern);
  if (!match || typeof match.index !== 'number') {
    return null;
  }

  return source.slice(0, match.index).split(/\r?\n/).length;
}

async function analyzeRepositoryValidationMarkers(files) {
  const summary = {
    global_validation_pipe_detected: false,
    class_validator_usage_detected: false,
    class_transformer_usage_detected: false,
    global_validation_pipe_location: null
  };

  for (const file of files) {
    const content = await fs.readFile(file.absolute_path, 'utf8');

    if (!summary.class_validator_usage_detected && detectClassValidatorMarkers(content).length > 0) {
      summary.class_validator_usage_detected = true;
    }

    if (!summary.class_transformer_usage_detected && detectClassTransformerMarkers(content).length > 0) {
      summary.class_transformer_usage_detected = true;
    }

    if (!summary.global_validation_pipe_detected && detectGlobalValidationPipe(content)) {
      const pattern = GLOBAL_VALIDATION_PIPE_PATTERN.test(content)
        ? GLOBAL_VALIDATION_PIPE_PATTERN
        : NEW_VALIDATION_PIPE_PATTERN;

      summary.global_validation_pipe_detected = true;
      summary.global_validation_pipe_location = {
        relative_path: file.relative_path,
        line: lineNumberForPattern(content, pattern)
      };
    }
  }

  return summary;
}

module.exports = {
  CLASS_TRANSFORMER_MARKERS,
  CLASS_VALIDATOR_MARKERS,
  FILE_VALIDATION_MARKERS,
  GLOBAL_VALIDATION_PIPE_PATTERN,
  HANDLER_PIPE_MARKERS,
  NEW_VALIDATION_PIPE_PATTERN,
  UPLOAD_INTERCEPTOR_MARKERS,
  analyzeRepositoryValidationMarkers,
  detectClassTransformerMarkers,
  detectClassValidatorMarkers,
  detectFileValidationMarkers,
  detectGlobalValidationPipe,
  detectHandlerPipeMarkers,
  detectUploadInterceptorMarkers,
  lineNumberForPattern
};
