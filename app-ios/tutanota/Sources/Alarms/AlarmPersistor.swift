import Foundation

protocol AlarmPersistor {
	var alarms: [EncryptedAlarmNotification] { get }

	func clear()

	func store(alarms: [EncryptedAlarmNotification])
}

class AlarmPreferencePersistor: AlarmPersistor {
	var alarms: [EncryptedAlarmNotification] { get { notificationStorage.alarms } }

	let notificationStorage: NotificationStorage
	let keychainManager: KeychainManager

	init(notificationsStorage: NotificationStorage, keychainManager: KeychainManager) {
		self.notificationStorage = notificationsStorage
		self.keychainManager = keychainManager
	}

	func clear() {
		self.notificationStorage.clear()
		do { try keychainManager.removePushIdentifierKeys() } catch { TUTSLog("Failed to remove pushIdentifier keys \(error)") }
	}

	func store(alarms: [EncryptedAlarmNotification]) { self.notificationStorage.store(alarms: alarms) }
}
