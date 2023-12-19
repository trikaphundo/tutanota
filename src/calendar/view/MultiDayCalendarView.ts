import m, { Children, Component, Vnode, VnodeDOM } from "mithril"
import { getStartOfDay, incrementDate, isToday, lastThrow, neverNull, ofClass, remove } from "@tutao/tutanota-utils"
import { formatShortTime, formatTime } from "../../misc/Formatter"
import {
	combineDateWithTime,
	DEFAULT_HOUR_OF_DAY,
	eventEndsAfterDay,
	eventStartsBefore,
	getDiffIn24hIntervals,
	getEventEnd,
	getEventStart,
	getRangeOfDays,
	getStartOfTheWeekOffset,
	getStartOfWeek,
	getTimeTextFormatForLongEvent,
	getTimeZone,
} from "../date/CalendarUtils"
import { CalendarDayEventsView, calendarDayTimes } from "./CalendarDayEventsView"
import { theme } from "../../gui/theme"
import { px, size } from "../../gui/size"
import { EventTextTimeOption, WeekStart } from "../../api/common/TutanotaConstants"
import { lang } from "../../misc/LanguageViewModel"
import { PageView } from "../../gui/base/PageView"
import type { CalendarEvent } from "../../api/entities/tutanota/TypeRefs.js"
import type { GroupColors } from "./CalendarView"
import type { EventDragHandlerCallbacks, MousePos } from "./EventDragHandler"
import { EventDragHandler } from "./EventDragHandler"
import { getPosAndBoundsFromMouseEvent } from "../../gui/base/GuiUtils"
import { UserError } from "../../api/main/UserError"
import { showUserError } from "../../misc/ErrorHandlerImpl"
import { styles } from "../../gui/styles"
import { CALENDAR_EVENT_HEIGHT, CalendarViewType, EventLayoutMode, getEventColor, layOutEvents, TEMPORARY_EVENT_OPACITY } from "../gui/CalendarGuiUtils.js"
import type { CalendarEventBubbleClickHandler, EventsOnDays } from "./CalendarViewModel"
import { ContinuingCalendarEventBubble } from "./ContinuingCalendarEventBubble"
import { isAllDayEvent } from "../../api/common/utils/CommonCalendarUtils"
import { locator } from "../../api/main/MainLocator.js"
import { DateTime } from "luxon"
import { DaysToEvents } from "../date/CalendarEventsRepository.js"
import { Time } from "../date/Time.js"
import { DaySelector } from "../gui/day-selector/DaySelector.js"

export type Attrs = {
	selectedDate: Date
	daysInPeriod: number
	onDateSelected: (date: Date, calendarViewTypeToShow?: CalendarViewType) => unknown
	getEventsOnDays: (range: Array<Date>) => EventsOnDays
	onNewEvent: (date: Date | null) => unknown
	onEventClicked: CalendarEventBubbleClickHandler
	groupColors: GroupColors
	hiddenCalendars: ReadonlySet<Id>
	startOfTheWeek: WeekStart
	onChangeViewPeriod: (next: boolean) => unknown
	temporaryEvents: Array<CalendarEvent>
	dragHandlerCallbacks: EventDragHandlerCallbacks
	eventsForDays: DaysToEvents
	isDaySelectorExpanded: boolean
	selectedTime?: Time
}

export class MultiDayCalendarView implements Component<Attrs> {
	private redrawIntervalId: NodeJS.Timeout | null = null
	private longEventsDom: HTMLElement | null = null
	private domElements: HTMLElement[] = []
	private scrollPosition: number
	private eventDragHandler: EventDragHandler
	private dateUnderMouse: Date | null = null
	private viewDom: HTMLElement | null = null
	private lastMousePos: MousePos | null = null
	private isHeaderEventBeingDragged: boolean = false

	constructor({ attrs }: Vnode<Attrs>) {
		this.scrollPosition = size.calendar_hour_height * DEFAULT_HOUR_OF_DAY
		this.eventDragHandler = new EventDragHandler(neverNull(document.body as HTMLBodyElement), attrs.dragHandlerCallbacks)
	}

	oncreate(vnode: VnodeDOM<Attrs>) {
		this.viewDom = vnode.dom as HTMLElement
	}

	onupdate(vnode: VnodeDOM<Attrs>) {
		this.viewDom = vnode.dom as HTMLElement
	}

	view({ attrs }: Vnode<Attrs>): Children {
		// Special case for week view

		const startOfThisPeriod =
			attrs.daysInPeriod === 7 ? getStartOfWeek(attrs.selectedDate, getStartOfTheWeekOffset(attrs.startOfTheWeek)) : attrs.selectedDate
		const startOfPreviousPeriod = incrementDate(new Date(startOfThisPeriod), -attrs.daysInPeriod)
		const startOfNextPeriod = incrementDate(new Date(startOfThisPeriod), attrs.daysInPeriod)

		const previousPageEvents = this.getEventsInRange(attrs.getEventsOnDays, attrs.daysInPeriod, startOfPreviousPeriod)
		const currentPageEvents = this.getEventsInRange(attrs.getEventsOnDays, attrs.daysInPeriod, startOfThisPeriod)
		const nextPageEvents = this.getEventsInRange(attrs.getEventsOnDays, attrs.daysInPeriod, startOfNextPeriod)
		const startOfWeek = getStartOfWeek(attrs.selectedDate, getStartOfTheWeekOffset(attrs.startOfTheWeek))
		const weekEvents = this.getEventsInRange(attrs.getEventsOnDays, 7, startOfWeek)

		const isDayView = attrs.daysInPeriod === 1
		const isDesktopLayout = styles.isDesktopLayout()

		return m(".flex.col.fill-absolute", [
			!isDesktopLayout
				? [
						this.renderDateSelector(attrs, isDayView),
						this.renderHeaderMobile(isDayView ? currentPageEvents : weekEvents, attrs.groupColors, attrs.onEventClicked, attrs.temporaryEvents),
				  ]
				: null,

			m(PageView, {
				previousPage: {
					key: startOfPreviousPeriod.getTime(),
					nodes: this.renderDays(attrs, previousPageEvents, currentPageEvents, isDayView, isDesktopLayout),
				},
				currentPage: {
					key: startOfThisPeriod.getTime(),
					nodes: this.renderDays(attrs, currentPageEvents, currentPageEvents, isDayView, isDesktopLayout),
				},
				nextPage: {
					key: startOfNextPeriod.getTime(),
					nodes: this.renderDays(attrs, nextPageEvents, currentPageEvents, isDayView, isDesktopLayout),
				},
				onChangePage: (next) => attrs.onChangeViewPeriod(next),
			}),
		])
	}

	private getEventsInRange(getEventsFunction: (range: Date[]) => EventsOnDays, daysInPeriod: number, startOfPeriod: Date) {
		const weekRange = getRangeOfDays(startOfPeriod, daysInPeriod)
		return getEventsFunction(weekRange)
	}

	private renderDateSelector(attrs: Attrs, isDayView: boolean): Children {
		return m("", [
			m(
				".header-bg.pb-s.overflow-hidden",
				{
					style: {
						"margin-left": px(size.calendar_hour_width_mobile),
					},
				},
				m(DaySelector, {
					eventsForDays: attrs.eventsForDays,
					selectedDate: attrs.selectedDate,
					onDateSelected: (date) => attrs.onDateSelected(date),
					wide: true,
					startOfTheWeekOffset: getStartOfTheWeekOffset(attrs.startOfTheWeek),
					isDaySelectorExpanded: attrs.isDaySelectorExpanded,
					handleDayPickerSwipe: (isNext: boolean) => {
						const sign = isNext ? 1 : -1
						const duration = {
							month: sign * (attrs.isDaySelectorExpanded ? 1 : 0),
							week: sign * (attrs.isDaySelectorExpanded ? 0 : 1),
						}

						attrs.onDateSelected(DateTime.fromJSDate(attrs.selectedDate).plus(duration).toJSDate())
					},
					showDaySelection: isDayView,
					highlightToday: true,
					highlightSelectedWeek: !isDayView,
					useNarrowWeekName: styles.isSingleColumnLayout(),
				}),
			),
		])
	}

	private static getTodayTimestamp(): number {
		return getStartOfDay(new Date()).getTime()
	}

	private renderDays(attrs: Attrs, thisPeriod: EventsOnDays, mainPeriod: EventsOnDays, isDayView: boolean, isDesktopLayout: boolean): Children {
		let containerStyle

		if (isDesktopLayout) {
			containerStyle = {
				marginLeft: "5px",
				overflow: "hidden",
				marginBottom: px(size.hpad_large),
			}
		} else {
			containerStyle = {}
		}

		return m(
			".fill-absolute.flex.col.overflow-hidden",
			{
				class: isDesktopLayout ? "mlr-l border-radius-big" : "border-radius-top-left-big border-radius-top-right-big content-bg mlr-safe-inset",
				style: containerStyle,
				onmousemove: (mouseEvent: EventRedraw<MouseEvent>) => {
					mouseEvent.redraw = false
					this.lastMousePos = getPosAndBoundsFromMouseEvent(mouseEvent)

					if (this.dateUnderMouse) {
						return this.eventDragHandler.handleDrag(this.dateUnderMouse, this.lastMousePos)
					}
				},
				onmouseup: (mouseEvent: EventRedraw<MouseEvent>) => {
					mouseEvent.redraw = false

					this.endDrag(mouseEvent)
				},
				onmouseleave: (mouseEvent: EventRedraw<MouseEvent>) => {
					mouseEvent.redraw = false

					this.endDrag(mouseEvent)
				},
			},
			[
				isDesktopLayout ? this.renderHeaderDesktop(attrs, thisPeriod, mainPeriod) : null,
				// using .scroll-no-overlay because of a browser bug in Chromium where scroll wouldn't work at all
				// see https://github.com/tutao/tutanota/issues/4846
				m(
					".flex.scroll-no-overlay.content-bg",
					{
						oncreate: (vnode) => {
							if (attrs.selectedTime) {
								this.scrollPosition = size.calendar_hour_height * attrs.selectedTime.hour
							}
							vnode.dom.scrollTop = this.scrollPosition

							for (const dom of this.domElements) {
								dom.scrollTop = this.scrollPosition
							}

							this.domElements.push(vnode.dom as HTMLElement)
						},
						onscroll: (event: Event) => {
							if (thisPeriod === mainPeriod) {
								for (const dom of this.domElements) {
									if (dom !== event.target) {
										dom.scrollTop = (event.target as HTMLElement).scrollTop
									}
								}

								this.scrollPosition = (event.target as HTMLElement).scrollTop
							}
						},
						onremove: (vnode) => {
							remove(this.domElements, vnode.dom as HTMLElement)
						},
					},
					[
						m(
							".flex.col",
							calendarDayTimes.map((time) => {
								const width = isDesktopLayout ? size.calendar_hour_width : size.calendar_hour_width_mobile
								return m(
									".calendar-hour.flex.cursor-pointer",
									{
										onclick: (e: MouseEvent) => {
											e.stopPropagation()
											attrs.onNewEvent(time.toDate(attrs.selectedDate))
										},
									},
									m(
										".pl-s.pr-s.center.small.flex.flex-column.justify-center",
										{
											style: {
												"line-height": isDesktopLayout ? px(size.calendar_hour_height) : "unset",
												width: px(width),
												height: px(size.calendar_hour_height),
												"border-right": `1px solid ${theme.content_border}`,
											},
										},
										isDesktopLayout ? formatTime(time.toDate()) : formatShortTime(time.toDate()),
									),
								)
							}),
						),
						m(
							".flex.flex-grow",
							thisPeriod.days.map((weekday, i) => {
								const events = thisPeriod.shortEvents[i]

								const newEventHandler = (hours: number, minutes: number) => {
									const newDate = new Date(weekday)
									newDate.setHours(hours, minutes)
									attrs.onNewEvent(newDate)
									attrs.onDateSelected(new Date(weekday))
								}

								return m(
									".flex-grow",
									{
										class: !isDayView ? "calendar-column-border" : "",
										style: {
											height: px(calendarDayTimes.length * size.calendar_hour_height),
										},
									},
									m(CalendarDayEventsView, {
										onEventClicked: attrs.onEventClicked,
										groupColors: attrs.groupColors,
										events: events,
										displayTimeIndicator: weekday.getTime() === MultiDayCalendarView.getTodayTimestamp(),
										onTimePressed: newEventHandler,
										onTimeContextPressed: newEventHandler,
										day: weekday,
										setCurrentDraggedEvent: (event) => this.startEventDrag(event),
										setTimeUnderMouse: (time) => (this.dateUnderMouse = combineDateWithTime(weekday, time)),
										isTemporaryEvent: (event) => attrs.temporaryEvents.includes(event),
										isDragging: this.eventDragHandler.isDragging,
										fullViewWidth: this.viewDom?.getBoundingClientRect().width,
									}),
								)
							}),
						),
					],
				),
			],
		)
	}

	private startEventDrag(event: CalendarEvent) {
		const lastMousePos = this.lastMousePos

		if (this.dateUnderMouse && lastMousePos) {
			this.eventDragHandler.prepareDrag(event, this.dateUnderMouse, lastMousePos, this.isHeaderEventBeingDragged)
		}
	}

	private renderHeaderMobile(
		thisPageEvents: EventsOnDays,
		groupColors: GroupColors,
		onEventClicked: CalendarEventBubbleClickHandler,
		temporaryEvents: Array<CalendarEvent>,
	): Children {
		const longEventsResult = this.renderLongEvents(thisPageEvents.days, thisPageEvents.longEvents, groupColors, onEventClicked, temporaryEvents, false)
		// We calculate the height manually because we want the header to transition between heights when swiping left and right
		// Hardcoding some styles instead of classes so that we can avoid nasty magic numbers
		const mainPageEventsCount = longEventsResult.rows
		const padding = mainPageEventsCount !== 0 ? size.vpad_small : 0
		// Set bottom padding in height, because it will be ignored in the style
		const height = mainPageEventsCount * CALENDAR_EVENT_HEIGHT + padding
		return m(
			".calendar-long-events-header.flex-fixed.calendar-hour-margin.pr-l.rel",
			{
				style: {
					marginLeft: size.calendar_hour_width_mobile,
					borderBottom: "none",
					height: px(height),
					paddingTop: px(padding),
					transition: "height 200ms ease-in-out",
				},
			},
			longEventsResult.children,
		)
	}

	private renderHeaderDesktop(attrs: Attrs, thisPageEvents: EventsOnDays, mainPageEvents: EventsOnDays): Children {
		const { daysInPeriod, onDateSelected, onEventClicked, groupColors, temporaryEvents } = attrs
		return m(".calendar-long-events-header.flex-fixed.content-bg.pt-s", [
			m(".calendar-hour-margin", [this.renderDayNamesRow(thisPageEvents.days, onDateSelected)]),
			m(".content-bg", [
				m(
					".calendar-hour-margin.content-bg",
					{
						onmousemove: (mouseEvent: MouseEvent) => {
							const { x, targetWidth } = getPosAndBoundsFromMouseEvent(mouseEvent)
							const dayWidth = targetWidth / daysInPeriod
							const dayNumber = Math.floor(x / dayWidth)
							const date = new Date(thisPageEvents.days[dayNumber])
							const dateUnderMouse = this.dateUnderMouse

							// When dragging short events, don't cause the mouse position date to drop to 00:00 when dragging over the header
							if (dateUnderMouse && this.eventDragHandler.isDragging && !this.isHeaderEventBeingDragged) {
								date.setHours(dateUnderMouse.getHours())
								date.setMinutes(dateUnderMouse.getMinutes())
							}

							this.dateUnderMouse = date
						},
					},
					// this section is tricky with margins. We use this view for both week and day view.
					// in day view there's no days row and no selection indicator.
					// it all must work with and without long events.
					// thread carefully and test all the cases.
					[this.renderLongEventsSection(thisPageEvents, mainPageEvents, groupColors, onEventClicked, temporaryEvents)],
				),
			]),
		])
	}

	private renderLongEventsSection(
		thisPageEvents: EventsOnDays,
		mainPageEvents: EventsOnDays,
		groupColors: GroupColors,
		onEventClicked: CalendarEventBubbleClickHandler,
		temporaryEvents: Array<CalendarEvent>,
	): Children {
		const thisPageLongEvents = this.renderLongEvents(thisPageEvents.days, thisPageEvents.longEvents, groupColors, onEventClicked, temporaryEvents, true)
		const mainPageLongEvents = this.renderLongEvents(mainPageEvents.days, mainPageEvents.longEvents, groupColors, onEventClicked, temporaryEvents, true)
		return m(
			".rel.mb-xs",
			{
				oncreate: (vnode) => {
					if (mainPageEvents === thisPageEvents) {
						this.longEventsDom = vnode.dom as HTMLElement
					}

					m.redraw()
				},
				onupdate: (vnode) => {
					if (mainPageEvents === thisPageEvents) {
						this.longEventsDom = vnode.dom as HTMLElement
					}
				},
				style: {
					height: px(mainPageLongEvents.rows * CALENDAR_EVENT_HEIGHT),
					width: "100%",
					transition: "height 200ms ease-in-out",
				},
			},
			thisPageLongEvents.children,
		)
	}

	/**
	 *
	 * @returns the rendered calendar bubble children, and the maximum number of events that occur on a day (out of all days)
	 */
	private renderLongEvents(
		dayRange: Array<Date>,
		events: Array<CalendarEvent>,
		groupColors: GroupColors,
		onEventClicked: CalendarEventBubbleClickHandler,
		temporaryEvents: Array<CalendarEvent>,
		isDesktopLayout: boolean,
	): {
		children: Children
		rows: number
	} {
		if (isDesktopLayout) {
			return dayRange.length === 1
				? {
						children: this.renderLongEventsForSingleDay(dayRange[0], events, groupColors, onEventClicked, temporaryEvents),
						rows: events.length,
				  }
				: this.renderLongEventsForMultipleDays(dayRange, events, groupColors, onEventClicked, temporaryEvents)
		} else {
			return this.renderLongEventsForMultipleDays(dayRange, events, groupColors, onEventClicked, temporaryEvents)
		}
	}

	/**
	 *Only called from day view where header events are not draggable
	 */
	private renderLongEventsForSingleDay(
		day: Date,
		events: Array<CalendarEvent>,
		groupColors: GroupColors,
		onEventClicked: CalendarEventBubbleClickHandler,
		temporaryEvents: Array<CalendarEvent>,
	): Children {
		const zone = getTimeZone()
		return [
			m(
				"",
				events.map((event) => {
					return this.renderLongEventBubble(
						event,
						getTimeTextFormatForLongEvent(event, day, day, zone),
						eventStartsBefore(day, zone, event),
						eventEndsAfterDay(day, zone, event),
						groupColors,
						(_, domEvent) => onEventClicked(event, domEvent),
						temporaryEvents.includes(event),
					)
				}),
			),
		]
	}

	private renderLongEventsForMultipleDays(
		dayRange: Array<Date>,
		events: Array<CalendarEvent>,
		groupColors: GroupColors,
		onEventClicked: CalendarEventBubbleClickHandler,
		temporaryEvents: Array<CalendarEvent>,
	): {
		children: Children
		rows: number
	} {
		if (this.longEventsDom == null && this.viewDom == null) {
			return {
				children: null,
				rows: 0,
			}
		}
		const dayWidth =
			(this.longEventsDom != null ? this.longEventsDom.offsetWidth : this.viewDom!.offsetWidth - size.calendar_hour_width_mobile) / dayRange.length
		let maxEventsInColumn = 0
		const firstDay = dayRange[0]
		const lastDay = lastThrow(dayRange)
		const zone = getTimeZone()
		const children = layOutEvents(
			events,
			zone,
			(columns) => {
				maxEventsInColumn = Math.max(maxEventsInColumn, columns.length)
				return columns.map((rows, c) =>
					rows.map((event) => {
						const isAllDay = isAllDayEvent(event)
						const eventEnd = isAllDay ? incrementDate(getEventEnd(event, zone), -1) : event.endTime
						const dayOfStartDate = getDiffIn24hIntervals(firstDay, getEventStart(event, zone))
						const dayOfEndDate = getDiffIn24hIntervals(firstDay, eventEnd)
						const startsBefore = eventStartsBefore(firstDay, zone, event)
						const endsAfter = eventEndsAfterDay(lastDay, zone, event)
						const left = startsBefore ? 0 : dayOfStartDate * dayWidth
						const right = endsAfter ? 0 : (dayRange.length - 1 - dayOfEndDate) * dayWidth
						return m(
							".abs",
							{
								style: {
									top: px(c * CALENDAR_EVENT_HEIGHT),
									left: px(left),
									right: px(right),
								},
								key: event._id[0] + event._id[1] + event.startTime.getTime(),
								onmousedown: () => {
									this.isHeaderEventBeingDragged = true
									this.startEventDrag(event)
								},
							},
							this.renderLongEventBubble(
								event,
								isAllDay ? null : EventTextTimeOption.START_END_TIME,
								startsBefore,
								endsAfter,
								groupColors,
								onEventClicked,
								temporaryEvents.includes(event),
							),
						)
					}),
				)
			},
			EventLayoutMode.DayBasedColumn,
		)
		return {
			children,
			rows: maxEventsInColumn,
		}
	}

	private renderLongEventBubble(
		event: CalendarEvent,
		showTime: EventTextTimeOption | null,
		startsBefore: boolean,
		endsAfter: boolean,
		groupColors: GroupColors,
		onEventClicked: CalendarEventBubbleClickHandler,
		isTemporary: boolean,
	): Children {
		const fadeIn = !isTemporary
		const opacity = isTemporary ? TEMPORARY_EVENT_OPACITY : 1
		const enablePointerEvents = !this.eventDragHandler.isDragging && !isTemporary
		return m(ContinuingCalendarEventBubble, {
			event,
			startsBefore,
			endsAfter,
			color: getEventColor(event, groupColors),
			onEventClicked,
			showTime,
			user: locator.logins.getUserController().user,
			fadeIn,
			opacity,
			enablePointerEvents,
		})
	}

	private renderDayNamesRow(days: Array<Date>, onDateSelected: (arg0: Date, arg1: CalendarViewType) => unknown): Children {
		if (days.length === 1) return null

		return m(
			".flex.mb-s",
			days.map((day) => {
				// the click handler is set on each child individually so as to not make the entire flex container clickable, only the text
				const onclick = () => onDateSelected(day, CalendarViewType.DAY)

				let circleStyle
				let textStyle

				if (isToday(day)) {
					circleStyle = {
						backgroundColor: theme.content_button,
						opacity: "0.25",
					}
					textStyle = {
						fontWeight: "bold",
					}
				} else {
					circleStyle = {}
					textStyle = {}
				}

				return m(".flex.center-horizontally.flex-grow.center.b", [
					m(
						".calendar-day-indicator.clickable",
						{
							onclick,
							style: {
								"padding-right": "4px",
							},
						},
						lang.formats.weekdayShort.format(day) + " ",
					),
					m(
						".rel.click.flex.items-center.justify-center.rel.ml-hpad_small",
						{
							"aria-label": day.toLocaleDateString(),
							onclick,
						},
						[
							m(".abs.z1.circle", {
								style: {
									...circleStyle,
									width: px(25),
									height: px(25),
								},
							}),
							m(
								".full-width.height-100p.center.z2",
								{
									style: {
										...textStyle,
										fontSize: "14px",
										lineHeight: "25px",
									},
								},
								day.getDate(),
							),
						],
					),
				])
			}),
		)
	}

	private endDrag(pos: MousePos) {
		this.isHeaderEventBeingDragged = false

		if (this.dateUnderMouse) {
			this.eventDragHandler.endDrag(this.dateUnderMouse, pos).catch(ofClass(UserError, showUserError))
		}
	}
}
