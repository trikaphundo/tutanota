import Contacts

enum ContactAddressType: String, Codable {
	case _private = "0"
	case work = "1"
	case other = "2"
	case custom = "3"
}

enum ContactPhoneNumberType: String, Codable {
	case _private = "0"
	case work = "1"
	case mobile = "2"
	case fax = "3"
	case other = "4"
	case custom = "5"
}

enum ContactCustomDateType: String, Codable {
	case anniversary = "0"
	case other = "1"
	case custom = "2"
}

enum ContactMessengerHandleType: String, Codable {
	case signal = "0"
	case whatsapp = "1"
	case telegram = "2"
	case discord = "3"
	case other = "4"
	case custom = "5"
}

enum ContactRelationshipType: String, Codable {
	case parent = "0"
	case brother = "1"
	case sister = "2"
	case child = "3"
	case friend = "4"
	case relative = "5"
	case spouse = "6"
	case partner = "7"
	case assistant = "8"
	case manager = "9"
	case other = "10"
	case custom = "11"
}

enum ContactWebsiteType: String, Codable {
	case _private = "0"
	case work = "1"
	case other = "2"
	case custom = "3"
}

protocol StableHashable { func hash(into: inout MurmurHash3.FourBytesHash) }

extension String: StableHashable { func hash(into hasher: inout MurmurHash3.FourBytesHash) { hasher.update(self.data(using: .utf8)!) } }

extension Optional: StableHashable where Wrapped: StableHashable { func hash(into hasher: inout MurmurHash3.FourBytesHash) {} }

extension Array: StableHashable where Element: StableHashable {
	func hash(into hasher: inout MurmurHash3.FourBytesHash) { for element in self { element.hash(into: &hasher) } }
}

extension StructuredMailAddress: StableHashable {
	func hash(into hasher: inout MurmurHash3.FourBytesHash) {
		address.hash(into: &hasher)
		type.hash(into: &hasher)
		customTypeName.hash(into: &hasher)
	}
}

extension StructuredAddress: StableHashable {
	func hash(into hasher: inout MurmurHash3.FourBytesHash) {
		address.hash(into: &hasher)
		type.hash(into: &hasher)
		customTypeName.hash(into: &hasher)
	}
}

extension StructuredPhoneNumber: StableHashable {
	func hash(into hasher: inout MurmurHash3.FourBytesHash) {
		number.hash(into: &hasher)
		type.hash(into: &hasher)
		customTypeName.hash(into: &hasher)
	}
}

extension StructuredCustomDate: StableHashable {
	func hash(into hasher: inout MurmurHash3.FourBytesHash) {
		dateIso.hash(into: &hasher)
		type.hash(into: &hasher)
		customTypeName.hash(into: &hasher)
	}
}

extension StructuredMessengerHandle: StableHashable {
	func hash(into hasher: inout MurmurHash3.FourBytesHash) {
		handle.hash(into: &hasher)
		type.hash(into: &hasher)
		customTypeName.hash(into: &hasher)
	}
}

extension StructuredRelationship: StableHashable {
	func hash(into hasher: inout MurmurHash3.FourBytesHash) {
		person.hash(into: &hasher)
		type.hash(into: &hasher)
		customTypeName.hash(into: &hasher)
	}
}

extension StructuredWebsite: StableHashable {
	func hash(into hasher: inout MurmurHash3.FourBytesHash) {
		url.hash(into: &hasher)
		type.hash(into: &hasher)
		customTypeName.hash(into: &hasher)
	}
}

extension RawRepresentable where RawValue: StableHashable { func hash(into hasher: inout MurmurHash3.FourBytesHash) { rawValue.hash(into: &hasher) } }

extension StructuredContact {
	func stableHash() -> UInt32 {
		var hash = MurmurHash3.FourBytesHash()
		id?.hash(into: &hash)
		firstName.hash(into: &hash)
		lastName.hash(into: &hash)
		nickname.hash(into: &hash)
		company.hash(into: &hash)
		birthday.hash(into: &hash)
		mailAddresses.hash(into: &hash)
		phoneNumbers.hash(into: &hash)
		addresses.hash(into: &hash)
		customDate.hash(into: &hash)
		department.hash(into: &hash)
		messengerHandles.hash(into: &hash)
		middleName.hash(into: &hash)
		nameSuffix.hash(into: &hash)
		phoneticFirst.hash(into: &hash)
		phoneticLast.hash(into: &hash)
		phoneticMiddle.hash(into: &hash)
		relationships.hash(into: &hash)
		websites.hash(into: &hash)
		notes.hash(into: &hash)
		title.hash(into: &hash)
		role.hash(into: &hash)
		return hash.digest()
	}
}
