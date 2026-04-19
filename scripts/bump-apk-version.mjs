#!/usr/bin/env node
/**
 * Ensures the next release APK has a strictly higher android.versionCode than any
 * previous build (reads both app.json and android/app/build.gradle, uses max + 1).
 *
 * Usage:
 *   node scripts/bump-apk-version.mjs           # increment versionCode only
 *   node scripts/bump-apk-version.mjs --patch   # also bump expo.version patch (1.0.1 -> 1.0.2)
 *
 * Run before: ./gradlew assembleRelease, eas build --platform android, etc.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const appJsonPath = path.join(root, 'app.json');
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');

const bumpPatch = process.argv.includes('--patch');

function readAppJson() {
  const raw = fs.readFileSync(appJsonPath, 'utf8');
  return JSON.parse(raw);
}

function writeAppJson(app) {
  fs.writeFileSync(appJsonPath, JSON.stringify(app, null, 2) + '\n');
}

function parseGradleCodes(gradleText) {
  const codeMatch = gradleText.match(/versionCode\s+(\d+)/);
  const nameMatch = gradleText.match(/versionName\s+"([^"]*)"/);
  return {
    versionCode: codeMatch ? parseInt(codeMatch[1], 10) : 0,
    versionName: nameMatch ? nameMatch[1] : null,
  };
}

function bumpSemverPatch(version) {
  const parts = String(version).split('.');
  while (parts.length < 3) parts.push('0');
  const patch = parseInt(parts[2], 10);
  parts[2] = Number.isFinite(patch) ? String(patch + 1) : '1';
  return parts.slice(0, 3).join('.');
}

function applyGradle(gradleText, versionCode, versionName) {
  let next = gradleText.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  next = next.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
  return next;
}

const app = readAppJson();
const expo = app.expo;
if (!expo) {
  console.error('app.json: missing expo root');
  process.exit(1);
}
expo.android = expo.android || {};

const gradleText = fs.readFileSync(gradlePath, 'utf8');
const fromGradle = parseGradleCodes(gradleText);
const fromJson = typeof expo.android.versionCode === 'number' ? expo.android.versionCode : 0;

const nextCode = Math.max(fromJson, fromGradle.versionCode, 0) + 1;
expo.android.versionCode = nextCode;

if (bumpPatch) {
  expo.version = bumpSemverPatch(expo.version || '1.0.0');
}

const versionName = expo.version || '1.0.0';
writeAppJson(app);

const newGradle = applyGradle(gradleText, nextCode, versionName);
fs.writeFileSync(gradlePath, newGradle);

console.log(
  `APK sequential version: versionCode ${fromJson} / ${fromGradle.versionCode} -> ${nextCode}, versionName "${versionName}" (app.json + android/app/build.gradle)`
);
