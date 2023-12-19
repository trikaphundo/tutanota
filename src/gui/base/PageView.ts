import m, { Children, Component, Vnode } from "mithril"
import { SwipeHandler } from "./SwipeHandler"
import { animations, transform, TransformEnum } from "../animation/Animations"
import { client } from "../../misc/ClientDetector.js"

type Page = {
	key: string | number
	nodes: Children
}
type Attrs = {
	previousPage: Page
	currentPage: Page
	nextPage: Page
	onChangePage: (next: boolean) => unknown
}

export class PageView implements Component<Attrs> {
	private viewDom: HTMLElement | null = null
	private onChangePage!: (_: boolean) => unknown

	view({ attrs }: Vnode<Attrs>): Children {
		this.onChangePage = (next) => attrs.onChangePage(next)
		return m(
			".rel.flex-grow.overflow-hidden",
			m(
				".fill-absolute",
				{
					style: {
						// this prevents "wobbly" calendar when the height is being changed, otherwise the scrollbar shows up until we actually do the resize
						// for a short time and shifts all the events horizontally. without scrollbar there's no horizontal shift.
						// overflow-y: hidden produces *horizontal* scrollbar for some reason? clip should do a similar thing
						// *but* overflow-y clip does very weird things to offscreen pages in mobile Safari (tested with 16.3.1)
						// as there are no scrollbar gutters on mobile anyway we don't have to set it
						"overflow-y": client.isMobileDevice() ? "" : "clip",
					},
					oncreate: (vnode) => {
						this.viewDom = vnode.dom as HTMLElement
						const swipeHandler = new PageSwipeHandler(this.viewDom, (next) => this.onChangePage(next))
						swipeHandler.attach()
					},
				},
				[
					m(
						".abs",
						{
							"aria-hidden": "true",
							key: attrs.previousPage.key,
							style: this.viewDom &&
								this.viewDom.offsetWidth > 0 && {
									width: this.viewDom.offsetWidth + "px",
									height: this.viewDom.offsetHeight + "px",
									transform: `translateX(${-this.viewDom.offsetWidth}px)`,
								},
						},
						attrs.previousPage.nodes,
					),
					m(
						".fill-absolute",
						{
							key: attrs.currentPage.key,
						},
						attrs.currentPage.nodes,
					),
					m(
						".abs",
						{
							"aria-hidden": "true",
							key: attrs.nextPage.key,
							style: this.viewDom &&
								this.viewDom.offsetWidth > 0 && {
									width: this.viewDom.offsetWidth + "px",
									height: this.viewDom.offsetHeight + "px",
									transform: `translateX(${this.viewDom.offsetWidth}px)`,
								},
						},
						attrs.nextPage.nodes,
					),
				],
			),
		)
	}
}

class PageSwipeHandler extends SwipeHandler {
	private readonly onGestureCompleted: (next: boolean) => unknown
	private xOffset: number = 0

	constructor(touchArea: HTMLElement, onGestureCompleted: (next: boolean) => unknown) {
		super(touchArea)
		// avoid flickering especially in day and week view when overflow-y is set on nested elements
		touchArea.style.transformStyle = "preserve-3d"
		touchArea.style.backfaceVisibility = "hidden"
		this.onGestureCompleted = onGestureCompleted
	}

	onHorizontalDrag(xDelta: number, yDelta: number) {
		this.xOffset = Math.abs(xDelta) > 40 ? xDelta : 0
		this.touchArea.style.transform = `translateX(${this.xOffset}px)`
	}

	onHorizontalGestureCompleted(delta: { x: number; y: number }): Promise<void> {
		if (Math.abs(delta.x) > 100) {
			this.xOffset = 0
			return animations
				.add(this.touchArea, transform(TransformEnum.TranslateX, delta.x, this.touchArea.offsetWidth * (delta.x > 0 ? 1 : -1)))
				.then(() => {
					this.onGestureCompleted(delta.x < 0)

					requestAnimationFrame(() => {
						this.touchArea.style.transform = ""
					})
				})
		} else {
			return this.reset(delta)
		}
	}

	reset(delta: { x: number; y: number }): Promise<any> {
		if (Math.abs(this.xOffset) > 40) {
			animations.add(this.touchArea, transform(TransformEnum.TranslateX, delta.x, 0))
		} else {
			this.touchArea.style.transform = ""
		}

		this.xOffset = 0
		return super.reset(delta)
	}
}
