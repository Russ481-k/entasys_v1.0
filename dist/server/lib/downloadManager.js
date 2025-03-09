import dayjs from 'dayjs';
import { EventEmitter } from 'events';
import fs from 'fs';

import { OpenSearchClient } from '../lib/opensearch';
import { generateFileNames } from '../utils/fileNaming';

export class DownloadManager {
  constructor() {
    this.downloads = new Map();
    this.eventEmitter = new EventEmitter();
    this.cleanupTimeouts = new Map();
  }
  generateFileNames(params) {
    const { clientFileName } = generateFileNames({
      downloadId: '', // downloadId는 나중에 설정됨
      menu: params.menu,
      index: params.index,
      total: params.total,
    });
    return { clientFileName };
  }
  async createDownload(downloadId, totalRows, searchParams) {
    try {
      // Get actual count from OpenSearch
      const actualCount = await this.getActualCount(searchParams);
      // Calculate number of chunks based on total rows
      const CHUNK_SIZE = 500000;
      const numChunks = Math.ceil(actualCount / CHUNK_SIZE);
      // Create download files with pre-generated clientFileNames
      const files = Array.from({ length: numChunks }, (_, index) => {
        const { serverFileName, clientFileName } = generateFileNames({
          downloadId,
          menu: searchParams.menu,
          index,
          total: numChunks,
        });
        const file = {
          downloadId,
          fileName: serverFileName,
          clientFileName,
          status: 'generating',
          progress: 0,
          processedRows: 0,
          totalRows: Math.min(CHUNK_SIZE, actualCount - index * CHUNK_SIZE),
          searchParams,
          message: 'Initializing download...',
          startTime: new Date(),
          lastUpdateTime: Date.now(),
          lastProcessedCount: 0,
          processingSpeed: 0,
          estimatedTimeRemaining: 0,
        };
        // Store file info in downloads map
        this.downloads.set(serverFileName, file);
        console.log('[DownloadManager] Created file:', {
          downloadId,
          serverFileName,
          clientFileName,
          totalRows: file.totalRows,
          timestamp: new Date().toISOString(),
        });
        return file;
      });
      console.log('[DownloadManager] Created download:', {
        downloadId,
        files: files.map((f) => ({
          fileName: f.fileName,
          clientFileName: f.clientFileName,
          totalRows: f.totalRows,
        })),
        timestamp: new Date().toISOString(),
      });
      // Return the first file's ID as the main download ID
      return {
        servedDownloadId: downloadId,
        files,
      };
    } catch (error) {
      console.error('[DownloadManager] Failed to create download:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        downloadId,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
  updateProgress(fileName, progress) {
    var _a, _b;
    const existingFile = this.downloads.get(fileName);
    if (!existingFile) {
      console.warn(`[DownloadManager] No download found for file: ${fileName}`);
      return;
    }
    const currentTime = Date.now();
    const timeDiff = (currentTime - existingFile.lastUpdateTime) / 1000;
    const processedRows =
      (_a = progress.processedRows) !== null && _a !== void 0
        ? _a
        : existingFile.processedRows;
    const processedDiff = processedRows - existingFile.lastProcessedCount;
    // Calculate processing speed (rows per second)
    const speed =
      timeDiff > 0 ? processedDiff / timeDiff : existingFile.processingSpeed;
    // Calculate estimated time remaining (in seconds)
    const remaining =
      speed > 0
        ? (existingFile.totalRows - processedRows) / speed
        : existingFile.estimatedTimeRemaining;
    // Update progress percentage
    const progressPercentage = Math.min(
      100,
      (processedRows / existingFile.totalRows) * 100
    );
    const updatedFile = Object.assign(
      Object.assign(Object.assign({}, existingFile), progress),
      {
        progress: progressPercentage,
        processingSpeed: speed,
        estimatedTimeRemaining: remaining,
        lastUpdateTime: currentTime,
        lastProcessedCount: processedRows,
        message: this.getProgressMessage(
          (_b = progress.status) !== null && _b !== void 0
            ? _b
            : existingFile.status,
          processedRows,
          existingFile.totalRows
        ),
      }
    );
    this.downloads.set(fileName, updatedFile);
    // Emit progress update
    this.eventEmitter.emit(
      `progress:${updatedFile.downloadId}`,
      updatedFile.downloadId,
      updatedFile
    );
    console.log(`[DownloadManager] Progress update for file:`, {
      fileName,
      downloadId: updatedFile.downloadId,
      status: updatedFile.status,
      progress: progressPercentage,
      processedRows,
      totalRows: existingFile.totalRows,
      speed: Math.round(speed),
      remaining: Math.round(remaining),
      clientFileName: updatedFile.clientFileName,
      timestamp: new Date().toISOString(),
    });
  }
  getProgress(fileName) {
    return this.downloads.get(fileName);
  }
  setError(fileName, error) {
    const progress = this.downloads.get(fileName);
    if (progress) {
      progress.error = new Error(error);
      progress.status = 'failed';
      this.downloads.set(fileName, progress);
      this.eventEmitter.emit(
        `progress:${progress.downloadId}`,
        progress.downloadId,
        progress
      );
    }
  }
  onProgressUpdate(downloadId, callback) {
    const eventName = `progress:${downloadId}`;
    this.eventEmitter.on(eventName, callback);
    // Send initial progress if available
    const files = Array.from(this.downloads.values()).filter(
      (file) => file.downloadId === downloadId
    );
    if (files.length > 0) {
      const firstFile = files[0];
      if (firstFile) {
        callback(downloadId, {
          downloadId,
          files,
          timestamp: new Date().toISOString(),
          overallProgress: {
            progress: firstFile.progress,
            status: firstFile.status,
            processedRows: firstFile.processedRows,
            totalRows: firstFile.totalRows,
            message: firstFile.message,
          },
        });
      }
    }
    return () => {
      this.eventEmitter.removeListener(eventName, callback);
    };
  }
  resumeDownload(fileName) {
    const progress = this.downloads.get(fileName);
    if (progress) {
      console.log('[DownloadManager] Resuming download 1:', {
        fileName,
        timestamp: new Date().toISOString(),
      });
      this.updateProgress(fileName, { status: 'downloading' });
    }
  }
  pauseDownload(fileName) {
    const progress = this.downloads.get(fileName);
    if (progress) {
      console.log('[DownloadManager] Pausing download 2:', {
        fileName,
        timestamp: new Date().toISOString(),
      });
      this.updateProgress(fileName, { status: 'ready' });
    }
  }
  cancelDownload(fileName) {
    const progress = this.downloads.get(fileName);
    if (progress) {
      console.log('[DownloadManager] Cancelling download 3:', {
        fileName,
        timestamp: new Date().toISOString(),
      });
      this.updateProgress(fileName, {
        status: 'failed',
        error: new Error('Download cancelled'),
      });
      this.downloads.delete(fileName);
    }
  }
  cleanup(fileName) {
    const file = this.downloads.get(fileName);
    if (!file) return;
    // Remove from downloads map
    this.downloads.delete(fileName);
    // Cancel any pending cleanup
    const timeout = this.cleanupTimeouts.get(fileName);
    if (timeout) {
      clearTimeout(timeout);
      this.cleanupTimeouts.delete(fileName);
    }
    // Delete the physical file
    try {
      const filePath = `./downloads/${fileName}`;
      fs.unlinkSync(filePath);
      console.log(`[DownloadManager] Deleted file ${filePath}`);
    } catch (error) {
      console.error(`[DownloadManager] Error deleting file:`, error);
    }
    // Notify clients
    this.eventEmitter.emit(`cleanup:${file.downloadId}`, file.downloadId);
  }
  handleError(downloadId, error) {
    try {
      const progress = this.downloads.get(downloadId);
      if (progress) {
        progress.error = new Error(error);
        progress.status = 'failed';
        this.downloads.set(downloadId, progress);
      }
    } catch (e) {
      console.error('Failed to handle error:', e);
    }
  }
  getDownload(fileId) {
    const file = this.downloads.get(fileId);
    console.log('[DownloadManager] Getting file info:', {
      fileId,
      found: !!file,
      info: file
        ? {
            fileName: file.fileName,
            clientFileName: file.clientFileName,
            status: file.status,
          }
        : undefined,
      timestamp: new Date().toISOString(),
    });
    return file;
  }
  initializeFiles(downloadId, files) {
    console.log('[DownloadManager] Initializing files:', {
      downloadId,
      files: files.map((f) => ({
        fileName: f.fileName,
        clientFileName: f.clientFileName,
        downloadId: f.downloadId,
      })),
      timestamp: new Date().toISOString(),
    });
    if (!!files && Array.isArray(files)) {
      files.forEach((file) => {
        this.downloads.set(file.fileName, file);
      });
    }
    this.eventEmitter.emit(`progress:${downloadId}`, downloadId, {
      downloadId,
      files,
      timestamp: new Date().toISOString(),
      overallProgress: {
        progress: 0,
        status: 'generating',
        processedRows: 0,
        totalRows: files.reduce((sum, file) => sum + file.totalRows, 0),
        message: 'Initializing download...',
      },
    });
  }
  async getActualCount(searchParams) {
    var _a;
    try {
      const client = OpenSearchClient.getInstance();
      // KST 시간을 UTC로 변환 (9시간 차이)
      const timeFrom = dayjs(searchParams.timeFrom)
        .subtract(9, 'hour')
        .format('YYYY-MM-DDTHH:mm:ss.SSS[Z]');
      const timeTo = dayjs(searchParams.timeTo)
        .subtract(9, 'hour')
        .format('YYYY-MM-DDTHH:mm:ss.SSS[Z]');
      const countQuery = {
        track_total_hits: true,
        query: {
          bool: {
            must: [
              {
                range: {
                  '@timestamp': {
                    gte: timeFrom,
                    lte: timeTo,
                    format: 'strict_date_time',
                  },
                },
              },
              {
                match: {
                  logType: searchParams.menu,
                },
              },
              {
                exists: {
                  field: 'message',
                },
              },
            ],
          },
        },
        _source: false,
        size: 0,
      };
      console.log('[DownloadManager] Count query:', {
        searchParams,
        timeFrom,
        timeTo,
        query: JSON.stringify(countQuery, null, 2),
        timestamp: new Date().toISOString(),
      });
      const response = await client.request({
        path: '/_search',
        method: 'POST',
        body: countQuery,
      });
      console.log('[DownloadManager] Count response:', {
        response: JSON.stringify(response, null, 2),
        searchParams,
        timeFrom,
        timeTo,
        timestamp: new Date().toISOString(),
      });
      const total =
        (_a =
          response === null || response === void 0 ? void 0 : response.hits) ===
          null || _a === void 0
          ? void 0
          : _a.total;
      if (!total || typeof total !== 'object' || !('value' in total)) {
        console.error('[DownloadManager] Invalid OpenSearch response:', {
          response: JSON.stringify(response, null, 2),
          searchParams,
          timeFrom,
          timeTo,
          timestamp: new Date().toISOString(),
        });
        throw new Error(
          'Invalid response from OpenSearch: missing total hits value'
        );
      }
      if (total.value === 0) {
        throw new Error('검색 결과가 없습니다.');
      }
      return total.value;
    } catch (error) {
      console.error('[DownloadManager] Failed to get actual count:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        searchParams,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
  scheduleCleanup(downloadId) {
    // Cancel any existing cleanup timeout
    const existingTimeout = this.cleanupTimeouts.get(downloadId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    // Get all files for this download
    const files = Array.from(this.downloads.values()).filter(
      (file) => file.downloadId === downloadId
    );
    // Only schedule cleanup if all files have been downloaded
    const allFilesDownloaded = files.every(
      (file) => file.status === 'completed'
    );
    if (!allFilesDownloaded) {
      console.log(
        `[DownloadManager] Skipping cleanup for ${downloadId} - files not yet downloaded`,
        {
          files: files.map((f) => ({
            fileName: f.fileName,
            status: f.status,
            timestamp: new Date().toISOString(),
          })),
        }
      );
      return;
    }
    // Schedule new cleanup after 5 minutes
    const timeout = setTimeout(
      () => {
        console.log(`[DownloadManager] Cleaning up download ${downloadId}`, {
          files: files.map((f) => ({
            fileName: f.fileName,
            status: f.status,
            timestamp: new Date().toISOString(),
          })),
        });
        files.forEach((file) => this.cleanup(file.fileName));
        this.cleanupTimeouts.delete(downloadId);
      },
      5 * 60 * 1000
    );
    this.cleanupTimeouts.set(downloadId, timeout);
  }
  getProgressMessage(status, processed, total) {
    switch (status) {
      case 'ready':
        return 'File is ready for download';
      case 'failed':
        return 'Download failed';
      case 'generating':
        return `Generating file... ${processed.toLocaleString()} of ${total.toLocaleString()} rows`;
      case 'downloading':
        return `Processing ${processed.toLocaleString()} of ${total.toLocaleString()} rows`;
      default:
        return 'Preparing file...';
    }
  }
  markAsDownloaded(fileName) {
    const file = this.downloads.get(fileName);
    if (file) {
      console.log('[DownloadManager] Marking file as downloaded:', {
        fileName,
        clientFileName: file.clientFileName,
        timestamp: new Date().toISOString(),
      });
      this.updateProgress(fileName, { status: 'completed' });
      this.scheduleCleanup(file.downloadId);
    }
  }
}
// Create and export singleton instance
export const downloadManager = new DownloadManager();
