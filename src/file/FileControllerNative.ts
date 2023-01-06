import { Dialog } from "../gui/base/Dialog"
import { DataFile } from "../api/common/DataFile"
import { assertMainOrNode, isAndroidApp, isApp, isDesktop, isElectronClient, isIOSApp, isTest } from "../api/common/Env"
import { assert, neverNull, promiseMap, sortableTimestamp } from "@tutao/tutanota-utils"
import { showProgressDialog } from "../gui/dialogs/ProgressDialog"
import { File as TutanotaFile } from "../api/entities/tutanota/TypeRefs.js"
import { FileReference } from "../api/common/utils/FileUtils"
import { CancelledError } from "../api/common/error/CancelledError"
import type { NativeFileApp } from "../native/common/FileApp"
import { ArchiveDataType } from "../api/common/TutanotaConstants"
import { BlobFacade } from "../api/worker/facades/BlobFacade"
import { FileFacade } from "../api/worker/facades/FileFacade"
import {
	doDownload,
	downloadAndDecryptDataFile,
	FileController,
	handleDownloadErrors,
	isLegacyFile,
	openDataFileInBrowser,
	zipDataFiles,
} from "./FileController.js"
import stream from "mithril/stream"

assertMainOrNode()

export class FileControllerNative implements FileController {
	constructor(private readonly fileApp: NativeFileApp, private readonly blobFacade: BlobFacade, private readonly fileFacade: FileFacade) {
		assert(isElectronClient() || isApp() || isTest(), "Don't make native file controller when not in native")
	}

	/**
	 * Temporary files are deleted afterwards in apps.
	 */
	async download(file: TutanotaFile) {
		await guiDownload(
			isAndroidApp() || isDesktop()
				? doDownload({
						tutanotaFiles: [file],
						downloadAction: (file) => this.downloadAndDecryptInNative(file),
						processDownloadedFiles: (files) => promiseMap(files, (file) => this.fileApp.putFileIntoDownloadsFolder(file.location)),
						cleanUp: (files) => this.cleanUp(files),
				  })
				: doDownload({
						tutanotaFiles: [file],
						downloadAction: (file) => this.downloadAndDecryptInNative(file),
						processDownloadedFiles: (files) => promiseMap(files, (file) => this.fileApp.open(file)),
						cleanUp: (files) => this.cleanUp(files),
				  }),
		)
	}

	async open(file: TutanotaFile) {
		await guiDownload(this.doOpen(file))
	}

	private async cleanUp(files: FileReference[]) {
		if (files.length > 0) {
			for (const file of files) {
				try {
					await this.fileApp.deleteFile(file.location)
				} catch (e) {
					console.log("failed to delete file", file.location, e)
				}
			}
		}
	}

	private async doOpen(tutanotaFile: TutanotaFile) {
		let temporaryFile: FileReference | null = null
		try {
			temporaryFile = await this.downloadAndDecryptInNative(tutanotaFile)
			await this.fileApp.open(temporaryFile)
		} finally {
			if (temporaryFile && isApp()) {
				// can't delete on desktop as we can't wait until the viewer has actually loaded the file
				const { location } = temporaryFile
				this.fileApp.deleteFile(location).catch((e) => console.log("failed to delete file", location, e))
			}
		}
	}

	/**
	 * Temporary files are deleted afterwards in apps.
	 */
	async downloadAll(tutanotaFiles: Array<TutanotaFile>): Promise<void> {
		const progress = stream(0)
		if (isAndroidApp()) {
			await guiDownload(
				doDownload({
					tutanotaFiles,
					downloadAction: (file) => this.downloadAndDecryptInNative(file),
					processDownloadedFiles: (files) => promiseMap(files, (file) => this.fileApp.putFileIntoDownloadsFolder(file.location)),
					cleanUp: (files) => this.cleanUp(files),
					progress,
				}),
				progress,
			)
		} else if (isIOSApp()) {
			await guiDownload(
				doDownload({
					tutanotaFiles,
					downloadAction: (file) => this.downloadAndDecryptInNative(file),
					processDownloadedFiles: (files) =>
						promiseMap(files, async (file) => {
							try {
								await this.fileApp.open(file)
							} finally {
								await this.fileApp.deleteFile(file.location).catch((e) => console.log("failed to delete file", file.location, e))
							}
						}),
					cleanUp: (files) => this.cleanUp(files),
					progress,
				}),
				progress,
			)
		} else if (isDesktop()) {
			await guiDownload(
				doDownload({
					tutanotaFiles,
					downloadAction: (file) => this.downloadAndDecryptInNative(file),
					processDownloadedFiles: async (files) => {
						const dataFiles = (await promiseMap(files, (f) => this.fileApp.readDataFile(f.location))).filter(Boolean)
						const zipFileInTemp = await this.fileApp.writeDataFile(
							await zipDataFiles(dataFiles as Array<DataFile>, `${sortableTimestamp()}-attachments.zip`),
						)
						return this.fileApp.putFileIntoDownloadsFolder(zipFileInTemp.location)
					},
					cleanUp: async () => {}, // no cleanup needed
					progress,
				}),
				progress,
			)
		} else {
			await guiDownload(
				doDownload({
					tutanotaFiles,
					downloadAction: (file) => this.downloadAndDecrypt(file),
					processDownloadedFiles: async (files) => openDataFileInBrowser(await zipDataFiles(files, `${sortableTimestamp()}-attachments.zip`)),
					cleanUp: async () => {},
					progress,
				}),
				progress,
			)
		}
	}

	/**
	 * Does not delete temporary file in app.
	 */
	async saveDataFile(file: DataFile): Promise<void> {
		// For apps "opening" DataFile currently means saving and opening it.
		try {
			const fileReference = await this.fileApp.writeDataFile(file)
			if (isAndroidApp() || isDesktop()) {
				await this.fileApp.putFileIntoDownloadsFolder(fileReference.location)
				return
			} else if (isIOSApp()) {
				return this.fileApp.open(fileReference)
			}
		} catch (e) {
			if (e instanceof CancelledError) {
				// no-op. User cancelled file dialog
				console.log("saveDataFile cancelled")
			} else {
				console.warn("openDataFile failed", e)
				await Dialog.message("canNotOpenFileOnDevice_msg")
			}
		}
	}

	async downloadAndDecrypt(file: TutanotaFile): Promise<DataFile> {
		return downloadAndDecryptDataFile(file, this.fileFacade, this.blobFacade)
	}

	/** Public for testing */
	async downloadAndDecryptInNative(tutanotaFile: TutanotaFile): Promise<FileReference> {
		if (isLegacyFile(tutanotaFile)) {
			return await this.fileFacade.downloadFileContentNative(tutanotaFile)
		} else {
			return await this.blobFacade.downloadAndDecryptNative(
				ArchiveDataType.Attachments,
				tutanotaFile.blobs,
				tutanotaFile,
				tutanotaFile.name,
				neverNull(tutanotaFile.mimeType),
			)
		}
	}
}

async function guiDownload(downloadPromise: Promise<void>, progress?: stream<number>) {
	try {
		await showProgressDialog("pleaseWait_msg", downloadPromise, progress)
	} catch (e) {
		// handle the user cancelling the dialog
		if (e instanceof CancelledError) {
			return
		}
		console.log("downloadAndOpen error", e.message)
		await handleDownloadErrors(e, Dialog.message)
	}
}
