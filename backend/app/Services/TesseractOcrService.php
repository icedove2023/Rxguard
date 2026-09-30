<?php

namespace App\Services;

use App\Models\Prescription;
use Illuminate\Contracts\Filesystem\FileNotFoundException;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;

/**
 * TesseractOcrService
 *
 * Open-source, free, offline OCR using the Tesseract CLI
 * (https://github.com/tesseract-ocr/tesseract) — no API keys, no
 * per-request cost, no vendor lock-in. This is step 1 of the
 * prescription pipeline: raw text extraction only. Gemini is used
 * later, purely as a text-cleanup/mapping *suggestion* engine
 * (see PrescriptionService::suggestCorrections()) — never for the
 * initial extraction itself.
 *
 * PDFs are rasterized to PNG page images first (via Imagick +
 * Ghostscript, also free/open-source) since Tesseract only reads
 * raster images.
 */
class TesseractOcrService
{
    private string $binary;
    private string $language;
    private int $timeoutSeconds;

    public function __construct()
    {
        $this->binary         = config('services.tesseract.binary', 'tesseract');
        $this->language       = config('services.tesseract.language', 'eng');
        $this->timeoutSeconds = (int) config('services.tesseract.timeout', 60);
    }

    /**
     * Extract raw text from a prescription's uploaded scan.
     *
     * @return array{text: string, confidence: float, engine: string, pages: int}
     */
    public function extractText(Prescription $prescription): array
    {
        $disk = config('filesystems.prescription_disk');
        $storage = Storage::disk($disk);

        if (!$storage->exists($prescription->scan_path)) {
            throw new FileNotFoundException('The uploaded prescription file was not found.');
        }

        try {
            $fileContent = $storage->get($prescription->scan_path);
        } catch (FileNotFoundException $e) {
            throw $e;
        }

        if (!$fileContent) {
            throw new \RuntimeException('The uploaded prescription file could not be read.');
        }

        $tmpDir = sys_get_temp_dir() . '/rxguard-ocr-' . uniqid('', true);
        if (!mkdir($tmpDir, 0700, true) && !is_dir($tmpDir)) {
            throw new \RuntimeException('Could not create a temporary OCR directory.');
        }

        try {
            $sourcePath = $tmpDir . '/source.' . $prescription->file_type;
            if (file_put_contents($sourcePath, $fileContent, LOCK_EX) !== strlen($fileContent)) {
                throw new \RuntimeException('Could not write the temporary OCR input file.');
            }

            $imagePaths = $prescription->file_type === 'pdf'
                ? $this->rasterizePdf($sourcePath, $tmpDir)
                : [$sourcePath];

            if (empty($imagePaths)) {
                throw new \RuntimeException('Could not prepare any pages for OCR.');
            }

            $allText        = [];
            $confidenceSum  = 0.0;
            $confidenceN    = 0;

            foreach ($imagePaths as $imagePath) {
                [$text, $avgConfidence] = $this->runTesseract($imagePath, $tmpDir);
                $allText[] = $text;

                if ($avgConfidence !== null) {
                    $confidenceSum += $avgConfidence;
                    $confidenceN++;
                }
            }

            $version = $this->detectVersion();

            return [
                'text'       => trim(implode("\n\n", array_filter($allText))),
                'confidence' => $confidenceN > 0 ? round($confidenceSum / $confidenceN, 1) : 0.0,
                'engine'     => "tesseract-{$version}",
                'pages'      => count($imagePaths),
            ];
        } finally {
            $this->cleanup($tmpDir);
        }
    }

    // ----------------------------------------------------------------
    // PDF -> images (Ghostscript via Imagick)
    // ----------------------------------------------------------------

    /**
     * @return string[] paths to rendered page images
     */
    private function rasterizePdf(string $pdfPath, string $tmpDir): array
    {
        if (!class_exists(\Imagick::class)) {
            throw new \RuntimeException(
                'PDF prescriptions require the Imagick PHP extension (with Ghostscript) on the server.'
            );
        }

        $paths = [];

        try {
            $imagick = new \Imagick();
            $imagick->setResourceLimit(\Imagick::RESOURCETYPE_MEMORY, 128 * 1024 * 1024);
            $imagick->setResourceLimit(\Imagick::RESOURCETYPE_MAP, 256 * 1024 * 1024);
            $imagick->setResourceLimit(\Imagick::RESOURCETYPE_DISK, 512 * 1024 * 1024);
            $imagick->setResolution(300, 300);
            $imagick->readImage($pdfPath . '[0-4]');

            foreach ($imagick as $index => $page) {
                $page->setImageFormat('png');
                $page->setImageColorspace(\Imagick::COLORSPACE_GRAY);
                $path = "{$tmpDir}/page-{$index}.png";
                $page->writeImage($path);
                $paths[] = $path;

                // Prescriptions are essentially always single/double page —
                // cap to avoid pathological multi-hundred-page PDF uploads.
                if (count($paths) >= 5) {
                    break;
                }
            }

            $imagick->clear();
        } catch (\Throwable $e) {
            throw new \RuntimeException('Failed to rasterize PDF for OCR.', 0, $e);
        }

        return $paths;
    }

    // ----------------------------------------------------------------
    // Tesseract CLI invocation
    // ----------------------------------------------------------------

    /**
     * Run tesseract on a single image, returning [plainText, avgConfidence].
     */
    private function runTesseract(string $imagePath, string $tmpDir): array
    {
        $outBase = $tmpDir . '/out-' . basename($imagePath, pathinfo($imagePath, PATHINFO_EXTENSION));

        // Request both outputs in one invocation to avoid doubling OCR time.
        $result = Process::timeout($this->timeoutSeconds)->run([
            $this->binary, $imagePath, $outBase,
            '-l', $this->language,
            '--psm', '6', // assume a single uniform block of text
            'txt',
            'tsv',
        ]);

        if ($result->failed()) {
            Log::error('Tesseract OCR failed', [
                'exit_code' => $result->exitCode(),
            ]);
            throw new \RuntimeException('Tesseract OCR process failed.');
        }

        $text = @file_get_contents($outBase . '.txt') ?: '';
        $confidence = $this->averageConfidenceFromTsv($outBase . '.tsv');

        return [$text, $confidence];
    }

    private function averageConfidenceFromTsv(string $tsvPath): ?float
    {
        if (!is_file($tsvPath)) {
            return null;
        }

        $lines = file($tsvPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!$lines || count($lines) < 2) {
            return null;
        }

        $header = str_getcsv(array_shift($lines), "\t");
        $confIndex = array_search('conf', $header, true);
        if ($confIndex === false) {
            return null;
        }

        $sum = 0.0;
        $n   = 0;

        foreach ($lines as $line) {
            $cols = str_getcsv($line, "\t");
            $conf = isset($cols[$confIndex]) ? (float) $cols[$confIndex] : -1.0;
            // Tesseract emits -1 for lines with no recognized text (e.g. block/paragraph rows)
            if ($conf >= 0) {
                $sum += $conf;
                $n++;
            }
        }

        return $n > 0 ? $sum / $n : null;
    }

    private function detectVersion(): string
    {
        try {
            $result = Process::timeout(5)->run([$this->binary, '--version']);
            $firstLine = strtok(trim($result->output() . $result->errorOutput()), "\n");

            if (preg_match('/tesseract\s+([0-9.]+)/i', (string) $firstLine, $m)) {
                return $m[1];
            }
        } catch (\Throwable) {
            // fall through to "unknown"
        }

        return 'unknown';
    }

    private function cleanup(string $tmpDir): void
    {
        if (!is_dir($tmpDir)) {
            return;
        }

        $files = glob($tmpDir . '/*') ?: [];
        foreach ($files as $file) {
            @unlink($file);
        }
        @rmdir($tmpDir);
    }
}
