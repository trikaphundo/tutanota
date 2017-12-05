//@flow
import type {WorkerClient} from "./WorkerClient"
import {ContactController} from "./ContactController"
import {EntityEventController} from "./EntityEventController"
import {EntropyCollector} from "./EntropyCollector"
import {SearchModel} from "../../search/SearchModel"
import {assertMainOrNode} from "../Env"
import {logins} from "./LoginController"

assertMainOrNode()

type MainLocatorType = {
	contact: ContactController;
	entityEvent: EntityEventController;
	entropyCollector: EntropyCollector;
	search:SearchModel;
}

export const locator: MainLocatorType = ({}:any)

window.tutao.locator = locator

export function initLocator(worker: WorkerClient) {
	locator.entityEvent = new EntityEventController(logins)
	locator.contact = new ContactController(locator.entityEvent)
	locator.entropyCollector = new EntropyCollector(worker)
	locator.search = new SearchModel()
}