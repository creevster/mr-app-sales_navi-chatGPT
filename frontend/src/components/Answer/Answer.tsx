// Imports remain the same
 import { FormEvent, useContext, useEffect, useMemo, useState } from 'react'
 import ReactMarkdown from 'react-markdown'
 import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
 import { nord } from 'react-syntax-highlighter/dist/esm/styles/prism'
 import { Checkbox, DefaultButton, Dialog, FontIcon, Stack, Text } from '@fluentui/react'
 import { useBoolean } from '@fluentui/react-hooks'
 import { ThumbDislike20Filled, ThumbLike20Filled } from '@fluentui/react-icons'
 import DOMPurify from 'dompurify'
 import remarkGfm from 'remark-gfm'
 import supersub from 'remark-supersub'
 import { AskResponse, Citation, Feedback, historyMessageFeedback } from '../../api'
 import { XSSAllowTags, XSSAllowAttributes } from '../../constants/sanatizeAllowables'
 import { AppStateContext } from '../../state/AppProvider'
 import { parseAnswer } from './AnswerParser'
 import styles from './Answer.module.css'

 interface Props {
  answer: AskResponse
  onCitationClicked: (citedDocument: Citation) => void
  onExectResultClicked: (answerId: string) => void
 }

 export const Answer = ({ answer, onCitationClicked, onExectResultClicked }: Props) => {
  const initializeAnswerFeedback = (answer: AskResponse) => {
    if (answer.message_id == undefined) return undefined
    if (answer.feedback == undefined) return undefined
    if (answer.feedback.split(',').length > 1) return Feedback.Negative
    if (Object.values(Feedback).includes(answer.feedback)) return answer.feedback
    return Feedback.Neutral
  }

  const [isRefAccordionOpen, { toggle: toggleIsRefAccordionOpen }] = useBoolean(false)
  const filePathTruncationLimit = 50

  const parsedAnswer = useMemo(() => parseAnswer(answer), [answer])
  const [chevronIsExpanded, setChevronIsExpanded] = useState(isRefAccordionOpen)
  const [feedbackState, setFeedbackState] = useState(initializeAnswerFeedback(answer))
  
  // NOTE: This part for the detailed feedback dialog is no longer used by the simple thumbs up/down
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false)
  const [showReportInappropriateFeedback, setShowReportInappropriateFeedback] = useState(false)
  const [negativeFeedbackList, setNegativeFeedbackList] = useState<Feedback[]>([])

  const appStateContext = useContext(AppStateContext)
  const FEEDBACK_ENABLED =
    appStateContext?.state.frontendSettings?.feedback_enabled && appStateContext?.state.isCosmosDBAvailable?.cosmosDB
  const SANITIZE_ANSWER = appStateContext?.state.frontendSettings?.sanitize_answer

  const handleChevronClick = () => {
    setChevronIsExpanded(!chevronIsExpanded)
    toggleIsRefAccordionOpen()
  }

  useEffect(() => {
    setChevronIsExpanded(isRefAccordionOpen)
  }, [isRefAccordionOpen])

  useEffect(() => {
    if (answer.message_id == undefined) return

    let currentFeedbackState
    if (appStateContext?.state.feedbackState && appStateContext?.state.feedbackState[answer.message_id]) {
      currentFeedbackState = appStateContext?.state.feedbackState[answer.message_id]
    } else {
      currentFeedbackState = initializeAnswerFeedback(answer)
    }
    setFeedbackState(currentFeedbackState)
  }, [appStateContext?.state.feedbackState, feedbackState, answer.message_id])


// =================================================================
  // ADDED: This is our new function to call your Azure Function API
  // =================================================================
  async function sendFeedbackToAzureFunction(feedbackType: 'up' | 'down') {
    // This component already has the question and answer from its props!
    // We access 'answer.question' safely and provide a default string if it's not found.
    const userQuestion = (answer as any)?.question ?? "Question not available";
    const modelAnswer = parsedAnswer.markdownFormatText;

    const feedbackData = {
        user_question: userQuestion,
        model_answer: modelAnswer,
        feedback_type: feedbackType
    };

    const functionUrl = 'https://sales-navi-feedback-api-d6aje8h6grdrf0bm.germanywestcentral-01.azurewebsites.net/api/submitFeedback?code=fwbD3oWRADwWs1d7_sqoPKD_naVvlvRC3WLaV8aEKWcYAzFu4IVdwg==';

    try {
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(feedbackData)
        });

        if (response.ok) {
            console.log(`Feedback '${feedbackType}' submitted successfully to Azure Function!`);
        } else {
            console.error('Failed to submit feedback to Azure Function:', await response.text());
        }
    } catch (error) {
        console.error('Error sending feedback to Azure Function:', error);
    }
  }


  const createCitationFilepath = (citation: Citation, index: number, truncate: boolean = false) => {
    let citationFilename = ''

    if (citation.filepath) {
      const part_i = citation.part_index ?? (citation.chunk_id ? parseInt(citation.chunk_id) + 1 : '')
      if (truncate && citation.filepath.length > filePathTruncationLimit) {
        const citationLength = citation.filepath.length
        citationFilename = `${citation.filepath.substring(0, 20)}...${citation.filepath.substring(
          citationLength - 20
        )} - Part ${part_i}`
      } else {
        citationFilename = `${citation.filepath} - Part ${part_i}`
      }
    } else if (citation.filepath && citation.reindex_id) {
      citationFilename = `${citation.filepath} - Part ${citation.reindex_id}`
    } else {
      citationFilename = `Citation ${index}`
    }
    return citationFilename
  }

  // =================================================================
  // CHANGED: This function is now simplified
  // =================================================================
  const onLikeResponseClicked = () => {
    if (answer.message_id == undefined) return

    let newFeedbackState = feedbackState
    if (feedbackState == Feedback.Positive) {
      newFeedbackState = Feedback.Neutral
    } else {
      newFeedbackState = Feedback.Positive
      sendFeedbackToAzureFunction('up'); // Call our new function
    }

    appStateContext?.dispatch({
      type: 'SET_FEEDBACK_STATE',
      payload: { answerId: answer.message_id, feedback: newFeedbackState }
    })
    setFeedbackState(newFeedbackState)
    // NOTE: The original call to `historyMessageFeedback` can be removed if you only want to use the new system
  }
  
  // =================================================================
  // CHANGED: This function is now simplified and doesn't open a dialog
  // =================================================================
  const onDislikeResponseClicked = () => {
    if (answer.message_id == undefined) return

    let newFeedbackState = feedbackState
    if (feedbackState === undefined || feedbackState === Feedback.Neutral || feedbackState === Feedback.Positive) {
      newFeedbackState = Feedback.Negative
      sendFeedbackToAzureFunction('down'); // Call our new function
    } else {
      newFeedbackState = Feedback.Neutral
    }

    appStateContext?.dispatch({
      type: 'SET_FEEDBACK_STATE',
      payload: { answerId: answer.message_id, feedback: newFeedbackState }
    })
    setFeedbackState(newFeedbackState)
    // NOTE: The original call to `historyMessageFeedback` can be removed if you only want to use the new system
  }


  // The rest of your file remains the same...
  const updateFeedbackList = (ev?: FormEvent<HTMLElement | HTMLInputElement>, checked?: boolean) => {
    if (answer.message_id == undefined) return
    const selectedFeedback = (ev?.target as HTMLInputElement)?.id as Feedback

    let feedbackList = negativeFeedbackList.slice()
    if (checked) {
      feedbackList.push(selectedFeedback)
    } else {
      feedbackList = feedbackList.filter(f => f !== selectedFeedback)
    }

    setNegativeFeedbackList(feedbackList)
  }

  const onSubmitNegativeFeedback = async () => {
    if (answer.message_id == undefined) return
    await historyMessageFeedback(answer.message_id, negativeFeedbackList.join(','))
    resetFeedbackDialog()
  }

  const resetFeedbackDialog = () => {
    setIsFeedbackDialogOpen(false)
    setShowReportInappropriateFeedback(false)
    setNegativeFeedbackList([])
  }

  const UnhelpfulFeedbackContent = () => { /* ... code unchanged ... */ return ( <></> )}
  const ReportInappropriateFeedbackContent = () => { /* ... code unchanged ... */ return ( <></> )}

  const components = {
    code({ node, ...props }: { node: any; [key: string]: any }) {
      let language
      if (props.className) {
        const match = props.className.match(/language-(\w+)/)
        language = match ? match[1] : undefined
      }
      const codeString = node.children[0].value ?? ''
      return (
        <SyntaxHighlighter style={nord} language={language} PreTag="div" {...props}>
          {codeString}
        </SyntaxHighlighter>
      )
    }
  }
  
  // The JSX return statement remains the same.
  return (
    <>
      <Stack className={styles.answerContainer} tabIndex={0}>
        <Stack.Item>
          <Stack horizontal grow>
            <Stack.Item grow>
              {parsedAnswer && <ReactMarkdown
                linkTarget="_blank"
                remarkPlugins={[remarkGfm, supersub]}
                children={
                  SANITIZE_ANSWER
                    ? DOMPurify.sanitize(parsedAnswer?.markdownFormatText, { ALLOWED_TAGS: XSSAllowTags, ALLOWED_ATTR: XSSAllowAttributes })
                    : parsedAnswer?.markdownFormatText
                }
                className={styles.answerText}
                components={components}
              />}
            </Stack.Item>
            <Stack.Item className={styles.answerHeader}>
              {FEEDBACK_ENABLED && answer.message_id !== undefined && (
                <Stack horizontal horizontalAlign="space-between">
                  <ThumbLike20Filled
                    aria-hidden="false"
                    aria-label="Like this response"
                    onClick={() => onLikeResponseClicked()}
                    style={
                      feedbackState === Feedback.Positive ||
                        appStateContext?.state.feedbackState[answer.message_id] === Feedback.Positive
                        ? { color: 'darkgreen', cursor: 'pointer' }
                        : { color: 'slategray', cursor: 'pointer' }
                    }
                  />
                  <ThumbDislike20Filled
                    aria-hidden="false"
                    aria-label="Dislike this response"
                    onClick={() => onDislikeResponseClicked()}
                    style={
                      feedbackState !== Feedback.Positive &&
                        feedbackState !== Feedback.Neutral &&
                        feedbackState !== undefined
                        ? { color: 'darkred', cursor: 'pointer' }
                        : { color: 'slategray', cursor: 'pointer' }
                    }
                  />
                </Stack>
              )}
            </Stack.Item>
          </Stack>
        </Stack.Item>
        {parsedAnswer?.generated_chart !== null && (
          <Stack className={styles.answerContainer}>
            <Stack.Item grow>
              <img src={`data:image/png;base64, ${parsedAnswer?.generated_chart}`} />
            </Stack.Item>
          </Stack>
        )}
        <Stack horizontal className={styles.answerFooter}>
          {!!parsedAnswer?.citations.length && (
            <Stack.Item onKeyDown={e => (e.key === 'Enter' || e.key === ' ' ? toggleIsRefAccordionOpen() : null)}>
              <Stack style={{ width: '100%' }}>
                <Stack horizontal horizontalAlign="start" verticalAlign="center">
                  <Text
                    className={styles.accordionTitle}
                    onClick={toggleIsRefAccordionOpen}
                    aria-label="Open references"
                    tabIndex={0}
                    role="button">
                    <span>
                      {parsedAnswer.citations.length > 1
                        ? parsedAnswer.citations.length + ' references'
                        : '1 reference'}
                    </span>
                  </Text>
                  <FontIcon
                    className={styles.accordionIcon}
                    onClick={handleChevronClick}
                    iconName={chevronIsExpanded ? 'ChevronDown' : 'ChevronRight'}
                  />
                </Stack>
              </Stack>
            </Stack.Item>
          )}
          <Stack.Item className={styles.answerDisclaimerContainer}>
            <span className={styles.answerDisclaimer}>AI-generated content may be incorrect</span>
          </Stack.Item>
          {!!answer.exec_results?.length && (
            <Stack.Item onKeyDown={e => (e.key === 'Enter' || e.key === ' ' ? toggleIsRefAccordionOpen() : null)}>
              <Stack style={{ width: '100%' }}>
                <Stack horizontal horizontalAlign="start" verticalAlign="center">
                  <Text
                    className={styles.accordionTitle}
                    onClick={() => onExectResultClicked(answer.message_id ?? '')}
                    aria-label="Open Intents"
                    tabIndex={0}
                    role="button">
                    <span>
                      Show Intents
                    </span>
                  </Text>
                  <FontIcon
                    className={styles.accordionIcon}
                    onClick={handleChevronClick}
                    iconName={'ChevronRight'}
                  />
                </Stack>
              </Stack>
            </Stack.Item>
          )}
        </Stack>
        {chevronIsExpanded && (
          <div className={styles.citationWrapper}>
            {parsedAnswer?.citations.map((citation, idx) => {
              return (
                <span
                  title={createCitationFilepath(citation, ++idx)}
                  tabIndex={0}
                  role="link"
                  key={idx}
                  onClick={() => onCitationClicked(citation)}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ' ? onCitationClicked(citation) : null)}
                  className={styles.citationContainer}
                  aria-label={createCitationFilepath(citation, idx)}>
                  <div className={styles.citation}>{idx}</div>
                  {createCitationFilepath(citation, idx, true)}
                </span>
              )
            })}
          </div>
        )}
      </Stack>
      <Dialog
        onDismiss={() => {
          resetFeedbackDialog()
          setFeedbackState(Feedback.Neutral)
        }}
        hidden={!isFeedbackDialogOpen}
        styles={{
          main: [
            {
              selectors: {
                ['@media (min-width: 480px)']: {
                  maxWidth: '600px',
                  background: '#FFFFFF',
                  boxShadow: '0px 14px 28.8px rgba(0, 0, 0, 0.24), 0px 0px 8px rgba(0, 0, 0, 0.2)',
                  borderRadius: '8px',
                  maxHeight: '600px',
                  minHeight: '100px'
                }
              }
            }
          ]
        }}
        dialogContentProps={{
          title: 'Submit Feedback',
          showCloseButton: true
        }}>
        <Stack tokens={{ childrenGap: 4 }}>
          <div>Your feedback will improve this experience.</div>

          {!showReportInappropriateFeedback ? <UnhelpfulFeedbackContent /> : <ReportInappropriateFeedbackContent />}

          <div>By pressing submit, your feedback will be visible to the application owner.</div>

          <DefaultButton disabled={negativeFeedbackList.length < 1} onClick={onSubmitNegativeFeedback}>
            Submit
          </DefaultButton>
        </Stack>
      </Dialog>
    </>
  )
 }
